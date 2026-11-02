import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Pool } from "pg";
import { testDatabaseUrl } from "./harness";
import {
  actionCalls,
  APPROVAL_KIND,
  onActionBehaviour,
  sendAndTakeToken,
  sentEmails,
  setUpNotificationDatabase,
  TEAM_ID,
} from "./notification-fixtures";

const { db } = await import("@recommand/db");
const { notify, withdrawNotifications } = await import("../../data/notifications/notify");
const { createSession } = await import("../../lib/session");
const { sign } = await import("../../lib/jwt");
const { default: notificationsApi } = await import("../../api/notifications");

const app = new Hono();
app.get("/login/:userId", async (c) => {
  await createSession(c, { id: c.req.param("userId"), isAdmin: false });
  return c.json({ ok: true });
});
app.route("/", notificationsApi);

let pool: Pool;

async function cookie(userId: string) {
  const response = await app.request(`/login/${userId}`);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

async function notifyAnna(requireLogin = false) {
  await notify({
    teamId: TEAM_ID,
    userIds: ["usr_anna"],
    kind: APPROVAL_KIND,
    subject: { type: "invoice", id: "doc_1" },
    key: "obl_1",
    data: { supplier: "Staalbouw Lemmens" },
    actions: { enabled: true, requireLogin },
    idempotencyKey: "obl_1:requested",
  });
  return sendAndTakeToken("anna@example.com");
}

async function read(token: string, headers: Record<string, string> = {}) {
  const response = await app.request(`/notification-actions/${encodeURIComponent(token)}`, { headers });
  return (await response.json()) as any;
}

async function act(token: string, body: { action: string; reason?: string }, headers: Record<string, string> = {}) {
  const response = await app.request(`/notification-actions/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}

describe.skipIf(!testDatabaseUrl)("notifications API", () => {
  beforeAll(async () => {
    pool = await setUpNotificationDatabase();
  });
  afterAll(async () => {
    await pool.end();
    await db.$client.end();
  });

  describe("action links", () => {
    beforeEach(async () => {
      await pool.query("TRUNCATE notifications, notification_preferences CASCADE");
      sentEmails.length = 0;
      actionCalls.length = 0;
      onActionBehaviour.status = "done";
      onActionBehaviour.fail = false;
      onActionBehaviour.during = undefined;
    });

    test("opening a link changes nothing; confirming acts once", async () => {
      const token = await notifyAnna();
      const link = await read(token);
      expect(link.state).toBe("ready");
      expect(link.userEmail).toBe("anna@example.com");
      expect(link.content.title).toBe("Your sign-off for Staalbouw Lemmens");
      expect(link.actions.map((action: { action: string }) => action.action)).toEqual(["approve", "reject"]);
      expect(actionCalls).toHaveLength(0);

      const first = await act(token, { action: "approve", reason: "  Agreed  " });
      expect(first).toEqual({ status: 200, body: { success: true, state: "done" } });
      expect(actionCalls).toEqual([{ action: "approve", userId: "usr_anna", channel: "email", reason: "Agreed" }]);
      const second = await act(token, { action: "reject", reason: "Too late" });
      expect(second.body.state).toBe("alreadyHandled");
      expect(actionCalls).toHaveLength(1);
      expect((await read(token)).state).toBe("alreadyHandled");

      const [row] = (await pool.query("SELECT acted_action, acted_channel, action_result, acted_at FROM notifications")).rows;
      expect(row).toMatchObject({ acted_action: "approve", acted_channel: "email", action_result: "done" });
      expect(row.acted_at).not.toBeNull();
    });

    test("a required reason and a known action are checked before the link is used", async () => {
      const token = await notifyAnna();
      expect((await act(token, { action: "reject" })).status).toBe(400);
      expect((await act(token, { action: "reject", reason: "   " })).status).toBe(400);
      expect((await act(token, { action: "delete" })).status).toBe(400);
      expect((await act(token, { action: "reject", reason: "Wrong amount" })).body.state).toBe("done");
      expect(actionCalls[0]!.reason).toBe("Wrong amount");
    });

    test("an expired link does not work", async () => {
      const token = await notifyAnna();
      await pool.query("UPDATE notification_action_tokens SET expires_at = now() - interval '1 minute'");
      expect((await read(token)).state).toBe("expired");
      expect((await act(token, { action: "approve" })).status).toBe(410);
      expect(actionCalls).toHaveLength(0);
    });

    test("a withdrawn notification's link does not work", async () => {
      const token = await notifyAnna();
      await withdrawNotifications({ teamId: TEAM_ID, key: "obl_1" });
      expect((await read(token)).state).toBe("alreadyHandled");
      expect((await act(token, { action: "approve" })).body.state).toBe("alreadyHandled");
      expect(actionCalls).toHaveLength(0);
    });

    test("withdrawing tells which users acted from a link", async () => {
      await notify({
        teamId: TEAM_ID,
        userIds: ["usr_bert"],
        kind: APPROVAL_KIND,
        subject: { type: "invoice", id: "doc_1" },
        key: "obl_1",
        data: { supplier: "Staalbouw Lemmens" },
        actions: { enabled: true, requireLogin: false },
        idempotencyKey: "obl_1:requested:bert",
      });
      const token = await notifyAnna();
      await act(token, { action: "approve" });
      const withdrawn = await withdrawNotifications({ teamId: TEAM_ID, key: "obl_1" });
      expect(withdrawn.map((row) => [row.userId, row.acted]).sort()).toEqual([
        ["usr_anna", true],
        ["usr_bert", false],
      ]);
    });

    test("a withdrawal inside onAction counts the acting user as acted", async () => {
      const token = await notifyAnna();
      let withdrawn: Awaited<ReturnType<typeof withdrawNotifications>> = [];
      onActionBehaviour.during = async () => {
        withdrawn = await withdrawNotifications({ teamId: TEAM_ID, key: "obl_1" });
      };
      expect((await act(token, { action: "approve" })).body.state).toBe("done");
      expect(withdrawn.map((row) => [row.userId, row.acted])).toEqual([["usr_anna", true]]);
    });

    test("an unknown or changed link does not work", async () => {
      const token = await notifyAnna();
      expect((await read(`${token}x`)).state).toBe("invalid");
      expect((await act(`${token}x`, { action: "approve" })).status).toBe(404);
      expect((await read("nonsense")).state).toBe("invalid");
    });

    test("with requireLogin only the signed-in user of the link can act", async () => {
      const token = await notifyAnna(true);
      const link = await read(token);
      expect(link).toMatchObject({ state: "loginRequired", requireLogin: true });
      expect(link.content).toBeUndefined();
      expect((await act(token, { action: "approve" })).status).toBe(401);

      const bert = await cookie("usr_bert");
      expect((await read(token, bert)).state).toBe("wrongUser");
      expect((await act(token, { action: "approve" }, bert)).status).toBe(403);
      expect(actionCalls).toHaveLength(0);

      const anna = await cookie("usr_anna");
      expect((await read(token, anna)).state).toBe("ready");
      expect((await act(token, { action: "approve" }, anna)).body.state).toBe("done");
    });

    test("an API key of the link's own user is not a session", async () => {
      const token = await notifyAnna(true);
      const expiresAt = new Date(Date.now() + 3600_000);
      await pool.query(
        `INSERT INTO api_keys (id, name, user_id, team_id, type, secret_hash, expires_at)
         VALUES ('key_anna', 'Anna', 'usr_anna', '${TEAM_ID}', 'jwt', '', $1) ON CONFLICT DO NOTHING`,
        [expiresAt]
      );
      const bearer = { Authorization: `Bearer ${await sign({ sub: "usr_anna", jti: "key_anna", teamId: TEAM_ID }, expiresAt)}` };
      expect((await read(token, bearer)).state).toBe("loginRequired");
      expect((await act(token, { action: "approve" }, bearer)).status).toBe(401);
      expect(actionCalls).toHaveLength(0);
      const [row] = (await pool.query("SELECT used_at FROM notification_action_tokens")).rows;
      expect(row.used_at).toBeNull();
    });

    test("a user who left the team cannot act", async () => {
      const token = await notifyAnna();
      await pool.query("DELETE FROM team_members WHERE user_id = 'usr_anna'");
      try {
        expect((await read(token)).state).toBe("denied");
        expect((await act(token, { action: "approve" })).body.state).toBe("denied");
        expect(actionCalls).toHaveLength(0);
      } finally {
        await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES ('${TEAM_ID}', 'usr_anna')`);
      }
    });

    test("the package's answer is passed on and recorded", async () => {
      const token = await notifyAnna();
      onActionBehaviour.status = "denied";
      expect((await act(token, { action: "approve" })).body.state).toBe("denied");
      const [row] = (await pool.query("SELECT action_result FROM notifications")).rows;
      expect(row.action_result).toBe("denied");
    });

    test("when the package fails, the link works again", async () => {
      const token = await notifyAnna();
      onActionBehaviour.fail = true;
      expect((await act(token, { action: "approve" })).status).toBe(500);
      onActionBehaviour.fail = false;
      expect((await act(token, { action: "approve" })).body.state).toBe("done");
    });

    test("two confirmations at the same time act once", async () => {
      const token = await notifyAnna();
      const results = await Promise.all([act(token, { action: "approve" }), act(token, { action: "approve" })]);
      expect(results.map((result) => result.body.state).sort()).toEqual(["alreadyHandled", "done"]);
      expect(actionCalls).toHaveLength(1);
    });
  });

  describe("notification preferences", () => {
    beforeEach(async () => {
      await pool.query("TRUNCATE notifications, notification_preferences CASCADE");
      sentEmails.length = 0;
    });

    test("a user chooses channels per kind", async () => {
      const anna = await cookie("usr_anna");
      const before = (await (await app.request("/account/notification-preferences", { headers: anna })).json()) as any;
      const approval = before.groups
        .flatMap((group: { kinds: any[] }) => group.kinds)
        .find((kind: { kind: string }) => kind.kind === APPROVAL_KIND);
      expect(approval).toMatchObject({ channels: ["email"], isDefault: true });

      const put = (channels: string[]) =>
        app.request(`/account/notification-preferences/${APPROVAL_KIND}`, {
          method: "PUT",
          headers: { ...anna, "Content-Type": "application/json" },
          body: JSON.stringify({ channels }),
        });
      expect((await put(["sms"])).status).toBe(400);
      expect((await put([])).status).toBe(200);
      const after = (await (await app.request("/account/notification-preferences", { headers: anna })).json()) as any;
      expect(
        after.groups.flatMap((group: { kinds: any[] }) => group.kinds).find((kind: { kind: string }) => kind.kind === APPROVAL_KIND)
      ).toMatchObject({ channels: [], isDefault: false });
      expect((await app.request("/account/notification-preferences")).status).toBe(401);
    });
  });
});
