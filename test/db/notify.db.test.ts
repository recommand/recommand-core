import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Pool } from "pg";
import { testDatabaseUrl } from "./harness";
import {
  APPROVAL_KIND,
  FLAKY_KIND,
  flakyChannel,
  INFO_KIND,
  sentEmails,
  setUpNotificationDatabase,
  TEAM_ID,
} from "./notification-fixtures";

const { db } = await import("@recommand/db");
const { notify, withdrawNotifications } = await import("../../data/notifications/notify");
const { processNotificationDeliveries } = await import("../../data/notifications/deliveries");
const { setNotificationPreference } = await import("../../data/notifications/preferences");

let pool: Pool;

const request = (overrides: Partial<Parameters<typeof notify>[0]> = {}) => ({
  teamId: TEAM_ID,
  userIds: ["usr_anna", "usr_bert"],
  kind: APPROVAL_KIND,
  subject: { type: "invoice", id: "doc_1" },
  key: "obl_1",
  data: { supplier: "Staalbouw Lemmens" },
  actions: { enabled: true, requireLogin: false },
  idempotencyKey: "obl_1:requested",
  ...overrides,
});

async function deliveries() {
  const result = await pool.query(
    `SELECT n.user_id, n.status AS notification_status, d.channel, d.status, d.attempts, d.attempt_log, d.retry_at
     FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id ORDER BY n.user_id`
  );
  return result.rows;
}

describe.skipIf(!testDatabaseUrl)("notify and deliver", () => {
  beforeAll(async () => {
    pool = await setUpNotificationDatabase();
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE notifications, notification_preferences CASCADE");
    sentEmails.length = 0;
  });
  afterAll(async () => {
    await pool.end();
    await db.$client.end();
  });

  test("records a notification with a pending delivery per member and sends nothing", async () => {
    const created = await notify(request({ userIds: ["usr_anna", "usr_bert", "usr_carl", "usr_anna"] }));
    expect(created.map((row) => row.userId).sort()).toEqual(["usr_anna", "usr_bert"]);
    const rows = await deliveries();
    expect(rows.map((row) => [row.user_id, row.channel, row.status])).toEqual([
      ["usr_anna", "email", "pending"],
      ["usr_bert", "email", "pending"],
    ]);
    expect(sentEmails).toHaveLength(0);
  });

  test("the same idempotency key never notifies a user twice", async () => {
    await notify(request());
    expect(await notify(request())).toEqual([]);
    expect(await deliveries()).toHaveLength(2);
  });

  test("writes in the caller's transaction", async () => {
    await db
      .transaction(async (tx) => {
        await notify(request({ tx }));
        throw new Error("roll back");
      })
      .catch(() => {});
    expect(await deliveries()).toHaveLength(0);
  });

  test("a user who turned a kind off, or a kind that is off by default, gets no notification", async () => {
    await setNotificationPreference("usr_bert", APPROVAL_KIND, []);
    const created = await notify(request());
    expect(created.map((row) => row.userId)).toEqual(["usr_anna"]);
    expect(await notify(request({ kind: INFO_KIND, idempotencyKey: "info" }))).toEqual([]);
    await setNotificationPreference("usr_bert", INFO_KIND, ["email"]);
    expect((await notify(request({ kind: INFO_KIND, idempotencyKey: "info" }))).map((row) => row.userId)).toEqual([
      "usr_bert",
    ]);
  });

  test("the worker sends the email in the user's language with action links", async () => {
    await notify(request({ userIds: ["usr_anna"] }));
    expect(await processNotificationDeliveries()).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe("anna@example.com");
    expect(sentEmails[0]!.subject).toBe("Your sign-off for Staalbouw Lemmens");
    expect(sentEmails[0]!.html).toContain("/notification-action/");
    const [row] = await deliveries();
    expect(row.status).toBe("sent");
    expect(row.attempt_log).toHaveLength(1);
    const tokens = await pool.query("SELECT channel, token_hash, expires_at, used_at FROM notification_action_tokens");
    expect(tokens.rows).toHaveLength(1);
    expect(tokens.rows[0].channel).toBe("email");
    expect(sentEmails[0]!.html).not.toContain(tokens.rows[0].token_hash);
    const hoursValid = (new Date(tokens.rows[0].expires_at).getTime() - Date.now()) / 3_600_000;
    expect(Math.round(hoursValid)).toBe(72);
  });

  test("without enabled actions the email has no links", async () => {
    await notify(request({ userIds: ["usr_anna"], actions: { enabled: false, requireLogin: true } }));
    await processNotificationDeliveries();
    expect(sentEmails[0]!.html).not.toContain("/notification-action/");
    expect((await pool.query("SELECT * FROM notification_action_tokens")).rows).toHaveLength(0);
  });

  test("withdrawing skips the pending deliveries", async () => {
    await notify(request());
    const withdrawn = await withdrawNotifications({ teamId: TEAM_ID, key: "obl_1", userIds: ["usr_bert"] });
    expect(withdrawn.map((row) => [row.userId, row.acted])).toEqual([["usr_bert", false]]);
    await processNotificationDeliveries();
    expect(sentEmails.map((email) => email.to)).toEqual(["anna@example.com"]);
    const rows = await deliveries();
    expect(rows.map((row) => [row.user_id, row.notification_status, row.status])).toEqual([
      ["usr_anna", "active", "sent"],
      ["usr_bert", "withdrawn", "skipped"],
    ]);
    expect(await withdrawNotifications({ teamId: TEAM_ID, key: "obl_1", userIds: ["usr_bert"] })).toEqual([]);
  });

  test("a user who left the team is not sent the message", async () => {
    await notify(request({ userIds: ["usr_bert"] }));
    await pool.query("DELETE FROM team_members WHERE user_id = 'usr_bert'");
    try {
      await processNotificationDeliveries();
      expect(sentEmails).toHaveLength(0);
      expect((await deliveries())[0].status).toBe("skipped");
    } finally {
      await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES ('${TEAM_ID}', 'usr_bert')`);
    }
  });

  test("a failed delivery is retried with backoff and every attempt is recorded", async () => {
    flakyChannel.failures = 2;
    await notify(request({ kind: FLAKY_KIND, userIds: ["usr_anna"], idempotencyKey: "flaky" }));
    await processNotificationDeliveries();
    let [row] = await deliveries();
    expect(row.status).toBe("failed");
    expect(new Date(row.retry_at).getTime()).toBeGreaterThan(Date.now());
    // Not due yet: nothing happens.
    expect(await processNotificationDeliveries()).toBe(0);
    for (let attempt = 0; attempt < 2; attempt++) {
      await pool.query("UPDATE notification_deliveries SET retry_at = now()");
      await processNotificationDeliveries();
    }
    [row] = await deliveries();
    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(3);
    expect(row.attempt_log.map((attempt: { status: string }) => attempt.status)).toEqual(["failed", "failed", "sent"]);
    expect(row.attempt_log[0].error).toBe("The channel did not answer");
    expect(flakyChannel.sent).toBe(1);
  });
  test("a send whose lease ran out counts as a failed attempt, and the last one gives up", async () => {
    await notify(request({ userIds: ["usr_anna"] }));
    const expireLease = () =>
      pool.query(
        "UPDATE notification_deliveries SET status = 'in_flight', locked_until = now() - interval '1 second', retry_at = now()"
      );
    await expireLease();
    expect(await processNotificationDeliveries()).toBe(1);
    let [row] = await deliveries();
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
    expect(row.attempt_log[0].error).toBe("The delivery did not finish");
    expect(new Date(row.retry_at).getTime()).toBeGreaterThan(Date.now());
    expect(sentEmails).toHaveLength(0);
    for (let attempt = 1; attempt < 5; attempt++) {
      await expireLease();
      await processNotificationDeliveries();
    }
    // The fifth failed attempt waits two hours for the sixth, the last one.
    [row] = await deliveries();
    expect(row.status).toBe("failed");
    expect(new Date(row.retry_at).getTime() - Date.now()).toBeGreaterThan(115 * 60_000);
    await expireLease();
    await processNotificationDeliveries();
    [row] = await deliveries();
    expect(row.status).toBe("giving_up");
    expect(row.attempts).toBe(6);
    await pool.query("UPDATE notification_deliveries SET retry_at = now()");
    expect(await processNotificationDeliveries()).toBe(0);
  });
});
