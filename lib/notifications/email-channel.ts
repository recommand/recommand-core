import { getEmailTemplate } from "@core/emails";
import type { NotificationEmailProps } from "@core/emails/notification-email";
import { sendEmail } from "../email";
import type { NotificationChannel } from "./types";

export type NotificationEmailSender = (email: Parameters<typeof sendEmail>[0]) => Promise<unknown>;

let sender: NotificationEmailSender = sendEmail;

/** Replaces how notification emails are sent. Tests use it to capture them. */
export function setNotificationEmailSender(next: NotificationEmailSender) {
  sender = next;
}

export const emailChannel: NotificationChannel = {
  channel: "email",
  ui: { label: "Email" },
  supportsActions: true,
  send: async ({ content, actions, settingsUrl, t, user, notification }) => {
    // A deployment can override the layout with its own `notification-email` template.
    const template = await getEmailTemplate<NotificationEmailProps>("notification-email");
    const props = { content, actions, settingsUrl, t };
    await sender({
      to: user.email,
      subject: template.subject(props),
      email: template.render(props),
      metadata: { notificationId: notification.id },
    });
  },
};
