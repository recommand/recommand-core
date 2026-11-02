import type { TranslationFunction } from "../translations";

/** One label and value row of a notification, for example "Due: 11 Nov 2026". */
export type NotificationField = {
  label: string;
  /** Several values are shown as several lines. */
  value: string | string[];
  /** `strong` for a key figure such as an amount, `mono` for a number or code. */
  style?: "strong" | "mono";
};

/**
 * What a notification says, without any channel format. Each channel turns it
 * into its own format: the email channel into one generic email layout.
 */
export type NotificationContent = {
  /** A short label above the title, for example "Approval needed". */
  eyebrow?: string;
  title: string;
  /** One line for message lists, such as an email subject. Defaults to the title. */
  subject?: string;
  summary?: string;
  fields?: NotificationField[];
  /** A highlighted remark, for example an earlier sign-off with its comment. */
  note?: { title: string; text?: string };
  /** Where the user handles it in the app. An absolute URL or a path. */
  link?: { label: string; url: string };
  /** Why the user gets this message, for example "The Purchase invoices workflow asks you to approve." */
  explanation?: string;
};

export type NotificationActionDefinition = {
  action: string;
  /** The button label, for example "Approve". */
  label: string;
  /** Whether the confirmation page asks for a reason. */
  reason: "none" | "optional" | "required";
  /** The question on the confirmation page, for example "Approve this invoice?". */
  confirmTitle?: string;
  /** The confirm button, for example "Confirm approval". */
  confirmLabel?: string;
  /** The placeholder of the reason field. */
  reasonPlaceholder?: string;
};

export type NotificationActionStatus = "done" | "alreadyHandled" | "denied";

/** A stored notification, as `render` and `onAction` get it. */
export type NotificationRecord<TData = unknown> = {
  id: string;
  teamId: string;
  userId: string;
  kind: string;
  subject: { type: string; id: string };
  key: string;
  data: TData;
  createdAt: Date;
};

export type NotificationRenderContext = {
  /** Translates into the recipient's language. */
  t: TranslationFunction;
  language: string;
  user: { id: string; email: string };
  team: { id: string; name: string };
};

export type NotificationActionInput<TData = unknown> = {
  notification: NotificationRecord<TData>;
  action: string;
  userId: string;
  channel: string;
  reason: string | null;
};

export type NotificationKind<TData = any> = {
  kind: string;
  /** English labels; the preferences screen translates them. */
  ui: { label: string; group: string; description?: string };
  /** The channels a user gets when they chose none. Empty: off until the user turns it on. */
  defaultChannels: string[];
  /** Runs when a delivery is sent and when the confirmation page opens. */
  render: (ctx: NotificationRenderContext, notification: NotificationRecord<TData>) => Promise<NotificationContent>;
  actions?: NotificationActionDefinition[];
  /** Applies the user's choice. Must check again that the user may still act. */
  onAction?: (input: NotificationActionInput<TData>) => Promise<{ status: NotificationActionStatus }>;
};

/** What a channel gets to deliver one notification to one user. */
export type NotificationDelivery = {
  notification: NotificationRecord;
  content: NotificationContent;
  user: { id: string; email: string; language: string };
  team: { id: string; name: string };
  t: TranslationFunction;
  /** The action links, only for channels that support actions and notifications that enable them. */
  actions: Array<NotificationActionDefinition & { url: string }>;
  /** The page where the user changes their notification channels. */
  settingsUrl: string;
};

export type NotificationChannel = {
  channel: string;
  ui: { label: string };
  supportsActions: boolean;
  /** Delivers the message. Throws when it fails; the delivery is retried later. */
  send: (delivery: NotificationDelivery) => Promise<void>;
};
