import { notificationActionTokens, notifications } from "@core/db/notification-schema";
import { ACTION_TOKEN_LIFETIME_MS, createActionToken, verifyActionToken } from "@core/lib/notifications/action-tokens";
import { db } from "@recommand/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  NotificationInputError,
  actionLinkUrl,
  getRecipient,
  kindOf,
  renderNotification,
  toNotificationRecord,
  type NotificationRow,
} from "./shared";

/**
 * Makes the action token of a notification for a message about to be sent, and
 * returns how to build its links. A new message replaces an earlier, unused
 * token. Returns null when the token was used already.
 */
export async function issueActionToken(notificationId: string, channel: string) {
  const { token, hash } = createActionToken();
  const expiresAt = new Date(Date.now() + ACTION_TOKEN_LIFETIME_MS);
  const [row] = await db
    .insert(notificationActionTokens)
    .values({ notificationId, channel, tokenHash: hash, expiresAt })
    .onConflictDoUpdate({
      target: notificationActionTokens.notificationId,
      set: { channel, tokenHash: hash, expiresAt },
      setWhere: isNull(notificationActionTokens.usedAt),
    })
    .returning({ id: notificationActionTokens.id });
  return row ? (action: string) => actionLinkUrl(token, action) : null;
}

/**
 * What an action link can do now, from the point of view of who opens it.
 * `alreadyHandled` also means that the notification was withdrawn.
 */
export type ActionLinkState =
  | "ready"
  | "loginRequired"
  | "wrongUser"
  | "alreadyHandled"
  | "expired"
  | "denied"
  | "invalid";

type InspectedLink =
  | { state: Exclude<ActionLinkState, "ready">; notification?: NotificationRow }
  | {
      state: "ready";
      notification: NotificationRow;
      tokenId: string;
      channel: string;
      recipient: NonNullable<Awaited<ReturnType<typeof getRecipient>>>;
    };

async function inspect(token: string, sessionUserId: string | null): Promise<InspectedLink> {
  const hash = verifyActionToken(token);
  if (!hash) {
    return { state: "invalid" };
  }
  const [row] = await db
    .select({ token: notificationActionTokens, notification: notifications })
    .from(notificationActionTokens)
    .innerJoin(notifications, eq(notifications.id, notificationActionTokens.notificationId))
    .where(eq(notificationActionTokens.tokenHash, hash));
  if (!row || !row.notification.actionsEnabled) {
    return { state: "invalid" };
  }
  const notification = row.notification;
  if (row.token.usedAt || notification.status === "withdrawn") {
    return { state: "alreadyHandled", notification };
  }
  if (row.token.expiresAt <= new Date()) {
    return { state: "expired", notification };
  }
  if (notification.requireLogin && sessionUserId !== notification.userId) {
    return { state: sessionUserId ? "wrongUser" : "loginRequired", notification };
  }
  const recipient = await getRecipient(notification);
  if (!recipient) {
    return { state: "denied", notification };
  }
  return { state: "ready", notification, tokenId: row.token.id, channel: row.token.channel, recipient };
}

/**
 * Reads an action link for the confirmation page. It changes nothing. The
 * content and actions are only returned when the link can be used.
 */
export async function readActionLink(token: string, sessionUserId: string | null) {
  const link = await inspect(token, sessionUserId);
  if (link.state !== "ready") {
    return { state: link.state, requireLogin: link.notification?.requireLogin ?? false };
  }
  const { content, actions } = await renderNotification(link.notification, link.recipient);
  return {
    state: link.state,
    requireLogin: link.notification.requireLogin,
    userEmail: link.recipient.user.email,
    content,
    actions,
  };
}

/**
 * Takes the action of a link. The token is consumed first, atomically, so a
 * link works once; the kind's `onAction` then applies it. When `onAction`
 * fails, the token works again.
 */
export async function performActionLink(input: {
  token: string;
  action: string;
  reason: string | null;
  sessionUserId: string | null;
}): Promise<{ state: Exclude<ActionLinkState, "ready"> | "done" }> {
  const link = await inspect(input.token, input.sessionUserId);
  if (link.state !== "ready") {
    return { state: link.state };
  }
  const kind = kindOf(link.notification);
  const definition = kind.actions?.find((action) => action.action === input.action);
  if (!definition || !kind.onAction) {
    throw new NotificationInputError("Unknown action");
  }
  const reason = input.reason?.trim() || null;
  if (definition.reason === "required" && !reason) {
    throw new NotificationInputError("A reason is required");
  }

  const [consumed] = await db
    .update(notificationActionTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(notificationActionTokens.id, link.tokenId),
        isNull(notificationActionTokens.usedAt),
        gt(notificationActionTokens.expiresAt, new Date()),
        sql`exists (select 1 from notifications where id = ${link.notification.id} and status = 'active')`
      )
    )
    .returning({ id: notificationActionTokens.id });
  if (!consumed) {
    return { state: "alreadyHandled" };
  }

  let status: Awaited<ReturnType<NonNullable<typeof kind.onAction>>>["status"];
  try {
    ({ status } = await kind.onAction({
      notification: toNotificationRecord(link.notification),
      action: input.action,
      userId: link.notification.userId,
      channel: link.channel,
      reason: definition.reason === "none" ? null : reason,
    }));
  } catch (error) {
    await db
      .update(notificationActionTokens)
      .set({ usedAt: null })
      .where(eq(notificationActionTokens.id, link.tokenId));
    throw error;
  }
  await db
    .update(notifications)
    .set({ actedAt: new Date(), actedAction: input.action, actedChannel: link.channel, actionResult: status })
    .where(eq(notifications.id, link.notification.id));
  return { state: status };
}
