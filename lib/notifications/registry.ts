import { emailChannel } from "./email-channel";
import type { NotificationChannel, NotificationKind } from "./types";

const kinds = new Map<string, NotificationKind>();
// Core ships the email channel.
const channels = new Map<string, NotificationChannel>([[emailChannel.channel, emailChannel]]);

export function registerNotificationKind<TData>(definition: NotificationKind<TData>) {
  if (kinds.has(definition.kind)) {
    throw new Error(`Notification kind already registered: ${definition.kind}`);
  }
  if (definition.actions?.length && !definition.onAction) {
    throw new Error(`Notification kind ${definition.kind} has actions but no onAction`);
  }
  kinds.set(definition.kind, definition);
}

export function registerNotificationChannel(definition: NotificationChannel) {
  if (channels.has(definition.channel)) {
    throw new Error(`Notification channel already registered: ${definition.channel}`);
  }
  channels.set(definition.channel, definition);
}

export function getNotificationKind(kind: string) {
  return kinds.get(kind);
}

export function listNotificationKinds() {
  return [...kinds.values()];
}

export function getNotificationChannel(channel: string) {
  return channels.get(channel);
}

export function listNotificationChannels() {
  return [...channels.values()];
}

/** For tests: forget the registered kinds. The channels stay. */
export function clearNotificationKinds() {
  kinds.clear();
}
