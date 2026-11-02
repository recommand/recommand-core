import { notificationPreferences } from "@core/db/notification-schema";
import { chooseChannels } from "@core/lib/notifications/channel-choice";
import { getNotificationKind, listNotificationChannels, listNotificationKinds } from "@core/lib/notifications/registry";
import type { TranslationFunction } from "@core/lib/translations";
import { NotificationInputError } from "./shared";
import { db } from "@recommand/db";
import { eq } from "drizzle-orm";

/** The kinds a user can choose channels for, grouped as the preferences screen shows them. */
export async function getNotificationPreferences(userId: string, t: TranslationFunction) {
  const rows = await db
    .select({ kind: notificationPreferences.kind, channels: notificationPreferences.channels })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const chosen = new Map(rows.map((row) => [row.kind, row.channels]));
  const channels = listNotificationChannels().map((channel) => ({ channel: channel.channel, label: t(channel.ui.label) }));
  const registered = channels.map((channel) => channel.channel);

  const groups = new Map<string, Array<{ kind: string; label: string; description: string | null; channels: string[]; isDefault: boolean }>>();
  for (const kind of listNotificationKinds()) {
    const group = groups.get(kind.ui.group) ?? [];
    group.push({
      kind: kind.kind,
      label: t(kind.ui.label),
      description: kind.ui.description ? t(kind.ui.description) : null,
      channels: chooseChannels(chosen.get(kind.kind), kind.defaultChannels, registered),
      isDefault: !chosen.has(kind.kind),
    });
    groups.set(kind.ui.group, group);
  }
  return {
    channels,
    groups: [...groups.entries()].map(([group, kinds]) => ({ group: t(group), kinds })),
  };
}

/** Sets the channels of one kind for a user. An empty list turns the kind off. */
export async function setNotificationPreference(userId: string, kind: string, channels: string[]) {
  if (!getNotificationKind(kind)) {
    throw new NotificationInputError("Unknown notification kind");
  }
  const registered = listNotificationChannels().map((channel) => channel.channel);
  const unknown = channels.filter((channel) => !registered.includes(channel));
  if (unknown.length > 0) {
    throw new NotificationInputError(`Unknown channel: ${unknown.join(", ")}`);
  }
  const unique = [...new Set(channels)];
  await db
    .insert(notificationPreferences)
    .values({ userId, kind, channels: unique })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.kind],
      set: { channels: unique },
    });
}
