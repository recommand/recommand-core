import {
  notificationActionTokens,
  notificationDeliveries,
  notificationPreferences,
  notifications,
} from "@core/db/notification-schema";
import { teamMembers } from "@core/db/schema";
import { chooseChannels } from "@core/lib/notifications/channel-choice";
import { getNotificationKind, listNotificationChannels } from "@core/lib/notifications/registry";
import { db } from "@recommand/db";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Tx } from "../rules/db";

export type NotifyInput = {
  teamId: string;
  userIds: string[];
  kind: string;
  /** What the notification is about, for example `{ type: "invoice", id }`. */
  subject: { type: string; id: string };
  /** Groups all notifications about the same thing, across kinds. */
  key: string;
  /** Input for the kind's `render` and `onAction`. */
  data?: unknown;
  /** Action links. Off unless enabled; a login is required unless turned off. */
  actions?: { enabled: boolean; requireLogin: boolean };
  /** Per team: the same key never notifies the same user twice. */
  idempotencyKey: string;
  /** Write in the caller's transaction. */
  tx?: Tx;
};

/**
 * Records a notification for each user who has a channel for the kind, with a
 * pending delivery per channel. It sends nothing: the delivery worker does.
 * Users who are not members of the team are left out. Returns the new
 * notifications; a repeated idempotency key creates none.
 */
export async function notify(input: NotifyInput): Promise<Array<{ id: string; userId: string }>> {
  const kind = getNotificationKind(input.kind);
  if (!kind) {
    throw new Error(`Unknown notification kind: ${input.kind}`);
  }
  const executor = input.tx ?? db;
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) {
    return [];
  }

  const members = await executor
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, input.teamId), inArray(teamMembers.userId, userIds)));
  const memberIds = new Set(members.map((member) => member.userId));
  const preferences = await executor
    .select({ userId: notificationPreferences.userId, channels: notificationPreferences.channels })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.kind, input.kind), inArray(notificationPreferences.userId, userIds)));
  const preferred = new Map(preferences.map((row) => [row.userId, row.channels]));
  const registered = listNotificationChannels().map((channel) => channel.channel);
  const actionsEnabled = Boolean(input.actions?.enabled && kind.actions?.length);

  const created: Array<{ id: string; userId: string }> = [];
  for (const userId of userIds.filter((id) => memberIds.has(id))) {
    const channels = chooseChannels(preferred.get(userId), kind.defaultChannels, registered);
    if (channels.length === 0) {
      continue;
    }
    const [row] = await executor
      .insert(notifications)
      .values({
        teamId: input.teamId,
        userId,
        kind: input.kind,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        key: input.key,
        data: input.data ?? null,
        actionsEnabled,
        requireLogin: input.actions?.requireLogin ?? true,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!row) {
      continue;
    }
    await executor
      .insert(notificationDeliveries)
      .values(channels.map((channel) => ({ notificationId: row.id, channel })));
    created.push({ id: row.id, userId });
  }
  return created;
}

/**
 * Says that the thing behind `key` no longer needs the users, for example
 * because someone else handled it. Pending deliveries are skipped and the
 * action links stop working. It sends no message. Returns the notifications
 * it withdrew. `acted` is true when the user acted from a link of the
 * notification, also while that action is still running. Core does not know
 * who acted in the app: the caller leaves those users out itself.
 */
export async function withdrawNotifications(input: {
  teamId: string;
  key: string;
  /** Only these users. All users when left out. */
  userIds?: string[];
  tx?: Tx;
}): Promise<Array<{ id: string; userId: string; kind: string; acted: boolean }>> {
  if (input.userIds?.length === 0) {
    return [];
  }
  const executor = input.tx ?? db;
  const withdrawn = await executor
    .update(notifications)
    .set({ status: "withdrawn", withdrawnAt: new Date() })
    .where(
      and(
        eq(notifications.teamId, input.teamId),
        eq(notifications.key, input.key),
        eq(notifications.status, "active"),
        input.userIds ? inArray(notifications.userId, input.userIds) : undefined
      )
    )
    .returning({
      id: notifications.id,
      userId: notifications.userId,
      kind: notifications.kind,
      acted: sql<boolean>`${or(
        isNotNull(notifications.actedAt),
        sql`exists (select 1 from ${notificationActionTokens} where ${notificationActionTokens.notificationId} = ${notifications.id} and ${notificationActionTokens.usedAt} is not null)`
      )}`,
    });
  if (withdrawn.length > 0) {
    await executor
      .update(notificationDeliveries)
      .set({ status: "skipped", lastError: "The notification was withdrawn", lockedUntil: null })
      .where(
        and(
          inArray(notificationDeliveries.notificationId, withdrawn.map((row) => row.id)),
          inArray(notificationDeliveries.status, ["pending", "failed"])
        )
      );
  }
  return withdrawn;
}
