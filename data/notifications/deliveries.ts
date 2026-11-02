import { notificationDeliveries, notifications } from "@core/db/notification-schema";
import { getNotificationChannel } from "@core/lib/notifications/registry";
import { db } from "@recommand/db";
import { eq, sql } from "drizzle-orm";
import { issueActionToken } from "./actions";
import { getRecipient, notificationSettingsUrl, renderNotification, toNotificationRecord } from "./shared";

// The waits after each failed attempt, as for event rule deliveries. The
// attempt after the last wait is the last one.
const retryScheduleMs = [30_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

type DeliveryRow = typeof notificationDeliveries.$inferSelect;

/**
 * Takes due deliveries with a five minute lease, so two workers never send the
 * same one. `reclaimed` is true when an earlier lease ran out before its send
 * finished.
 */
async function claimDueDeliveries(limit: number): Promise<Array<{ id: string; reclaimed: boolean }>> {
  const result = await db.execute(sql`
    with due as (
      select id, status from notification_deliveries
      where (status in ('pending', 'failed') and retry_at <= now())
         or (status = 'in_flight' and locked_until < now())
      order by retry_at
      limit ${limit}
      for update skip locked
    )
    update notification_deliveries
    set status = 'in_flight',
        locked_until = now() + interval '5 minutes',
        updated_at = now()
    from due
    where notification_deliveries.id = due.id
    returning notification_deliveries.id, due.status = 'in_flight' as reclaimed`);
  return result.rows as Array<{ id: string; reclaimed: boolean }>;
}

async function finish(delivery: DeliveryRow, values: Partial<DeliveryRow>) {
  await db
    .update(notificationDeliveries)
    .set({ lockedUntil: null, ...values })
    .where(eq(notificationDeliveries.id, delivery.id));
}

async function skip(delivery: DeliveryRow, reason: string) {
  await finish(delivery, { status: "skipped", lastError: reason });
}

async function deliver(delivery: DeliveryRow) {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, delivery.notificationId));
  if (!notification || notification.status === "withdrawn") {
    return skip(delivery, "The notification was withdrawn");
  }
  const channel = getNotificationChannel(delivery.channel);
  if (!channel) {
    return finish(delivery, { status: "giving_up", lastError: `Unknown channel: ${delivery.channel}` });
  }
  const recipient = await getRecipient(notification);
  if (!recipient) {
    return skip(delivery, "The user is no longer a member of the team");
  }

  const at = new Date();
  const attempts = delivery.attempts + 1;
  try {
    const { content, actions, t } = await renderNotification(notification, recipient);
    const links = channel.supportsActions && actions.length > 0 ? await issueActionToken(notification.id, channel.channel) : null;
    await channel.send({
      notification: toNotificationRecord(notification),
      content,
      user: recipient.user,
      team: recipient.team,
      t,
      actions: links ? actions.map((action) => ({ ...action, url: links(action.action) })) : [],
      settingsUrl: notificationSettingsUrl,
    });
    await finish(delivery, {
      status: "sent",
      attempts,
      sentAt: at,
      lastError: null,
      attemptLog: [...delivery.attemptLog, { at: at.toISOString(), status: "sent", error: null }],
    });
  } catch (error) {
    await fail(delivery, error instanceof Error ? error.message : String(error));
  }
}

/** Records a failed attempt. The backoff sets the next one; the last one gives up. */
async function fail(delivery: DeliveryRow, message: string) {
  const at = new Date();
  const attempts = delivery.attempts + 1;
  await finish(delivery, {
    status: attempts > retryScheduleMs.length ? "giving_up" : "failed",
    attempts,
    lastError: message,
    retryAt: new Date(at.getTime() + retryScheduleMs[Math.min(delivery.attempts, retryScheduleMs.length - 1)]!),
    attemptLog: [...delivery.attemptLog, { at: at.toISOString(), status: "failed", error: message }],
  });
}

/** Sends the due deliveries. Returns how many it took. */
export async function processNotificationDeliveries(limit = 50) {
  const claimed = await claimDueDeliveries(limit);
  for (const { id, reclaimed } of claimed) {
    const [delivery] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id));
    if (!delivery) {
      continue;
    }
    // A worker that stops during a send counts as a failed attempt, so a
    // send that never finishes still gives up.
    if (reclaimed) {
      await fail(delivery, "The delivery did not finish");
    } else {
      await deliver(delivery);
    }
  }
  return claimed.length;
}
