import { notifications } from "@core/db/notification-schema";
import { teamMembers, teams, users } from "@core/db/schema";
import { baseUrl } from "@core/emails/components/shared";
import { getNotificationKind } from "@core/lib/notifications/registry";
import type { NotificationContent, NotificationRecord } from "@core/lib/notifications/types";
import { createServerT } from "@core/lib/translations-server";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";

export type NotificationRow = typeof notifications.$inferSelect;

/** The page where a user chooses their notification channels. */
export const notificationSettingsUrl = `${baseUrl}/account`;

export function actionLinkUrl(token: string, action: string) {
  return `${baseUrl}/notification-action/${encodeURIComponent(token)}?action=${encodeURIComponent(action)}`;
}

export function toNotificationRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    kind: row.kind,
    subject: { type: row.subjectType, id: row.subjectId },
    key: row.key,
    data: row.data,
    createdAt: row.createdAt,
  };
}

/** The recipient and their team, or null when the user is no longer a member. */
export async function getRecipient(notification: NotificationRow) {
  const [row] = await db
    .select({ id: users.id, email: users.email, language: users.language, teamName: teams.name })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.teamId, notification.teamId), eq(teamMembers.userId, notification.userId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    user: { id: row.id, email: row.email, language: row.language },
    team: { id: notification.teamId, name: row.teamName },
  };
}

/** The kind of a notification. It throws when the kind is no longer registered. */
export function kindOf(notification: NotificationRow) {
  const kind = getNotificationKind(notification.kind);
  if (!kind) {
    throw new Error(`Unknown notification kind: ${notification.kind}`);
  }
  return kind;
}

/** Renders a notification in the recipient's language, with its kind's actions. */
export async function renderNotification(
  notification: NotificationRow,
  recipient: NonNullable<Awaited<ReturnType<typeof getRecipient>>>
) {
  const kind = kindOf(notification);
  const t = await createServerT(recipient.user.language);
  const content: NotificationContent = await kind.render(
    { t, language: recipient.user.language, user: recipient.user, team: recipient.team },
    toNotificationRecord(notification)
  );
  const actions = notification.actionsEnabled
    ? (kind.actions ?? []).map((action) => ({
        ...action,
        label: t(action.label),
        confirmTitle: action.confirmTitle && t(action.confirmTitle),
        confirmLabel: action.confirmLabel && t(action.confirmLabel),
        reasonPlaceholder: action.reasonPlaceholder && t(action.reasonPlaceholder),
      }))
    : [];
  return { kind, t, content, actions };
}

/** A request the caller must correct, such as an unknown kind or a missing reason. */
export class NotificationInputError extends Error {}
