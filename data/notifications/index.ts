// What other packages use to send notifications. See docs/notifications.md.
export {
  registerNotificationChannel,
  registerNotificationKind,
} from "@core/lib/notifications/registry";
export { setNotificationEmailSender } from "@core/lib/notifications/email-channel";
export { usersWhoDidNotAct } from "@core/lib/notifications/withdrawn";
export type * from "@core/lib/notifications/types";
export { notify, withdrawNotifications, type NotifyInput } from "./notify";
export { processNotificationDeliveries } from "./deliveries";
