import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AuthenticatedUserContext } from "../../lib/auth-middleware";
import { pool, useTestDatabase } from "./harness";

process.env.JWT_SECRET = "oauth-connected-apps-test-only-signing-key";
process.env.BASE_URL = "https://recommand.example.com";
const { createSession } = await import("../../lib/session");
const { default: connectedApps } = await import("../../api/oauth/connected-apps");
const { findClient } = await import("../../data/oauth-clients");
const { createGrant } = await import("../../data/oauth-grants");
const { issueTokens, rotateRefreshToken } = await import("../../data/oauth-tokens");
const { requireTeamAccess } = await import("../../lib/auth-middleware");
const { registerPermission } = await import("../../lib/permissions");

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "all", id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });

const app = new Hono<AuthenticatedUserContext>();
app.get("/login/:userId", async (c) => {
  await createSession(c, { id: c.req.param("userId"), isAdmin: false });
  return c.json({ ok: true });
});
app.get("/:teamId/access", requireTeamAccess(), (c) => c.json({ ok: true }));
app.route("/", connectedApps);

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions, audit_events CASCADE");
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('member', 'member@example.com', 'unused', false),
    ('other', 'other@example.com', 'unused', false)`);
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two')");
  await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES
    ('one', 'member'), ('two', 'member'), ('one', 'other')`);
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'test.read'), ('member', 'one', 'test.write'), ('member', 'two', 'test.read'), ('other', 'one', 'test.read')`);
  await pool.query(`INSERT INTO oauth_clients (id, kind, name, grant_types, redirect_uris, token_endpoint_auth_method, metadata_fetched_at) VALUES
    ('dcr_app', 'dynamic', 'Example', '{authorization_code}', '{https://app.example.com/callback}', 'none', NULL),
    ('https://cli.example.com/client.json', 'dynamic', NULL, '{authorization_code}', '{http://127.0.0.1/callback}', 'none', now())`);
});

const grantFor = async (userId: string, teamIds: string[], permissionIds: string[], clientId = "dcr_app") => {
  const client = (await findClient(clientId))!;
  const { grant } = await createGrant({ client, permissionIds, teamIds, userId });
  return grant;
};
const cookie = async (userId = "member") => {
  const response = await app.request(`/login/${userId}`);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
};
const list = async (headers: Record<string, string>) => {
  const response = await app.request("/oauth/connected-apps", { headers });
  return { body: (await response.json()) as any, status: response.status };
};
const disconnect = async (clientId: string, userId = "member") => {
  const response = await app.request(`/oauth/connected-apps?clientId=${encodeURIComponent(clientId)}`, {
    headers: await cookie(userId),
    method: "DELETE",
  });
  return response.status;
};
const activeGrantIds = async (userId = "member") => {
  const { rows } = await pool.query("SELECT id FROM oauth_grants WHERE user_id = $1", [userId]);
  return rows.map((row) => row.id);
};

describe("listing connected apps", () => {
  test("shows the user's apps, newest first, with what each reaches per team", async () => {
    const older = await grantFor("member", ["one", "two"], ["test.read", "test.write"]);
    await pool.query("UPDATE oauth_grants SET created_at = now() - interval '1 day' WHERE id = $1", [older.id]);
    await grantFor("member", ["two"], ["test.read"], "https://cli.example.com/client.json");
    await grantFor("other", ["one"], ["test.read"]);

    const { body } = await list(await cookie());
    expect(body.apps).toMatchObject([
      {
        client: { host: "cli.example.com", id: "https://cli.example.com/client.json", name: null },
        teams: [{ id: "two", name: "Two", permissions: [{ id: "test.read", name: "Read" }] }],
      },
      {
        client: { host: null, id: "dcr_app", name: "Example" },
        teams: [
          {
            id: "one",
            permissions: [
              { id: "test.read", name: "Read" },
              { id: "test.write", name: "Write" },
            ],
          },
          { id: "two", permissions: [{ id: "test.read", name: "Read" }] },
        ],
      },
    ]);
  });

  test("shows an app connected more than once as one app, with what it holds altogether", async () => {
    const first = await grantFor("member", ["one"], ["test.read", "test.write"]);
    await pool.query("UPDATE oauth_grants SET created_at = now() - interval '1 day', last_used_at = now() - interval '1 hour' WHERE id = $1", [
      first.id,
    ]);
    await grantFor("member", ["one", "two"], ["test.read"]);

    const { body } = await list(await cookie());
    const { rows } = await pool.query("SELECT created_at, last_used_at FROM oauth_grants WHERE id = $1", [first.id]);
    expect(body.apps).toEqual([
      {
        client: { host: null, id: "dcr_app", name: "Example", uri: null },
        connectedAt: rows[0].created_at.toISOString(),
        lastUsedAt: rows[0].last_used_at.toISOString(),
        teams: [
          {
            id: "one",
            name: "One",
            permissions: [
              { id: "test.read", name: "Read" },
              { id: "test.write", name: "Write" },
            ],
          },
          { id: "two", name: "Two", permissions: [{ id: "test.read", name: "Read" }] },
        ],
      },
    ]);
  });

  test("shows when each app last used its access", async () => {
    const grant = await grantFor("member", ["one"], ["test.read"]);
    const { accessToken, refreshToken } = (await issueTokens({ grantId: grant.id, resources: [], withRefreshToken: true }))!;
    const lastUsedAt = async () => (await list(await cookie())).body.apps[0].lastUsedAt;
    expect(await lastUsedAt()).toBeNull();

    const response = await app.request("/one/access", { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(response.status).toBe(200);
    expect(Date.now() - Date.parse(await lastUsedAt())).toBeLessThan(60_000);

    await pool.query("UPDATE oauth_grants SET last_used_at = now() - interval '1 day'");
    expect((await rotateRefreshToken(refreshToken!, "dcr_app")).type).toBe("rotated");
    expect(Date.now() - Date.parse(await lastUsedAt())).toBeLessThan(60_000);
  });

  test("leaves out disconnected apps", async () => {
    await grantFor("member", ["one"], ["test.read"]);
    expect(await disconnect("dcr_app")).toBe(200);
    expect((await list(await cookie())).body.apps).toEqual([]);
  });

  test("isn't open to the apps themselves", async () => {
    const grant = await grantFor("member", ["one"], ["test.read"]);
    const { accessToken } = (await issueTokens({ grantId: grant.id, resources: [], withRefreshToken: false }))!;
    expect((await list({ Authorization: `Bearer ${accessToken}` })).status).toBe(403);
  });
});

describe("disconnecting an app", () => {
  test("ends the access of every time it was connected, at once", async () => {
    const first = await grantFor("member", ["one"], ["test.read"]);
    const second = await grantFor("member", ["two"], ["test.read"]);
    await issueTokens({ grantId: first.id, resources: [], withRefreshToken: true });
    await issueTokens({ grantId: second.id, resources: [], withRefreshToken: true });
    const other = await grantFor("member", ["one"], ["test.read"], "https://cli.example.com/client.json");
    expect(await disconnect("dcr_app")).toBe(200);

    expect(await activeGrantIds()).toEqual([other.id]);
    expect((await pool.query("SELECT * FROM oauth_access_tokens")).rows).toEqual([]);
    expect((await pool.query("SELECT * FROM oauth_refresh_tokens")).rows).toEqual([]);
    const { rows: audits } = await pool.query(
      "SELECT action, object_id, reason_code FROM audit_events WHERE object_type = 'core.oauth_grant' ORDER BY object_id"
    );
    expect(audits).toEqual(
      [first.id, second.id].toSorted().map((grantId) => ({ action: "revoke_access", object_id: grantId, reason_code: "user_revoked" }))
    );
  });

  test("takes an app identified by its metadata document's URL", async () => {
    await grantFor("member", ["one"], ["test.read"], "https://cli.example.com/client.json");
    expect(await disconnect("https://cli.example.com/client.json")).toBe(200);
    expect(await activeGrantIds()).toEqual([]);
  });

  test("can't touch another user's app", async () => {
    const grant = await grantFor("other", ["one"], ["test.read"]);
    expect(await disconnect("dcr_app")).toBe(404);
    expect(await disconnect("unknown_app")).toBe(404);
    expect(await activeGrantIds("other")).toEqual([grant.id]);
  });
});
