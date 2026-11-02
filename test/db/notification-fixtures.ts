import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { connectTestDatabase } from "./harness";

// The data, the kinds and the fake email sender the notification tests share.
// Import ./harness first: it points the database module at the test database.

const { registerNotificationChannel, registerNotificationKind } = await import("../../lib/notifications/registry");
const { setNotificationEmailSender } = await import("../../lib/notifications/email-channel");
const { processNotificationDeliveries } = await import("../../data/notifications/deliveries");

export const TEAM_ID = "team_notify";

/** The emails the fake sender got, rendered to HTML. */
export const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

/** What `onAction` of the approval kind got, and what it answers next. */
export const actionCalls: Array<{ action: string; userId: string; channel: string; reason: string | null }> = [];
export const onActionBehaviour: {
  status: "done" | "alreadyHandled" | "denied";
  fail: boolean;
  /** Runs inside `onAction`, like a package that closes the task there. */
  during?: () => Promise<void>;
} = {
  status: "done",
  fail: false,
};

/** How many times the next sends of the flaky channel fail. */
export const flakyChannel = { failures: 0, sent: 0 };

export const APPROVAL_KIND = "test.approval.requested";
export const INFO_KIND = "test.info";
export const FLAKY_KIND = "test.flaky";

export async function setUpNotificationDatabase() {
  const pool = await connectTestDatabase();
  await pool.query(`INSERT INTO users (id, email, password_hash, language) VALUES
    ('usr_anna', 'anna@example.com', 'unused', 'en'),
    ('usr_bert', 'bert@example.com', 'unused', 'nl'),
    ('usr_carl', 'carl@example.com', 'unused', 'en')`);
  await pool.query(`INSERT INTO teams (id, name) VALUES ('${TEAM_ID}', 'Noordhaven Logistics')`);
  // Carl is not a member of the team.
  await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES
    ('${TEAM_ID}', 'usr_anna'), ('${TEAM_ID}', 'usr_bert')`);

  setNotificationEmailSender(async (email) => {
    const html = typeof email.email === "string" ? email.email : await render(email.email as ReactElement);
    sentEmails.push({ to: email.to, subject: email.subject, html });
  });
  registerNotificationKind<{ supplier: string }>({
    kind: APPROVAL_KIND,
    ui: { label: "Approval requests", group: "Approvals" },
    defaultChannels: ["email"],
    render: async ({ t }, notification) => ({
      eyebrow: t`Approval needed`,
      title: `Your sign-off for ${notification.data.supplier}`,
      fields: [{ label: "From", value: notification.data.supplier }],
    }),
    actions: [
      { action: "approve", label: "Approve", reason: "optional" },
      { action: "reject", label: "Reject", reason: "required" },
    ],
    onAction: async ({ action, userId, channel, reason }) => {
      if (onActionBehaviour.fail) {
        throw new Error("The workflow is not available");
      }
      actionCalls.push({ action, userId, channel, reason });
      await onActionBehaviour.during?.();
      return { status: onActionBehaviour.status };
    },
  });
  registerNotificationKind({
    kind: INFO_KIND,
    ui: { label: "Information", group: "Other" },
    defaultChannels: [],
    render: async () => ({ title: "For your information" }),
  });
  registerNotificationChannel({
    channel: "flaky",
    ui: { label: "Flaky" },
    supportsActions: false,
    send: async () => {
      if (flakyChannel.failures > 0) {
        flakyChannel.failures--;
        throw new Error("The channel did not answer");
      }
      flakyChannel.sent++;
    },
  });
  registerNotificationKind({
    kind: FLAKY_KIND,
    ui: { label: "Flaky messages", group: "Other" },
    defaultChannels: ["flaky"],
    render: async () => ({ title: "Flaky" }),
  });
  return pool;
}

/** Sends the due deliveries and returns the action token of the last email to `to`. */
export async function sendAndTakeToken(to: string) {
  await processNotificationDeliveries();
  const email = sentEmails.findLast((candidate) => candidate.to === to);
  const token = email?.html.match(/notification-action\/([^?"]+)\?action=/)?.[1];
  if (!token) {
    throw new Error(`No action link was sent to ${to}`);
  }
  return decodeURIComponent(token);
}
