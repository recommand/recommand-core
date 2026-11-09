import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { decodeJwt, generateKeyPair, SignJWT } from "jose";
import type { AuthenticatedUserContext } from "../../lib/auth-middleware";
import { pool, useTestDatabase } from "./harness";

process.env.JWT_SECRET = "oauth-bearer-test-only-signing-key";
process.env.BASE_URL = "https://recommand.example.com";
const { default: apiKeys } = await import("../../api/api-keys");
const { default: rules } = await import("../../api/rules");
const { findClient } = await import("../../data/oauth-clients");
const { createGrant, deleteGrant } = await import("../../data/oauth-grants");
const { issueTokens } = await import("../../data/oauth-tokens");
const { requireAdmin, requireAuth, requireTeamAccess } = await import("../../lib/auth-middleware");
const { registerPermission } = await import("../../lib/permissions");
const { requireGlobalPermission, requirePermission } = await import("../../lib/permissions/permission-middleware");

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "all", id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });
registerPermission({ id: "test.global", name: "Global", prerequisiteActorPermissionIds: [], scope: "global" });

const app = new Hono<AuthenticatedUserContext>();
const ok = (c: any) => c.json({ team: c.get("team")?.id ?? null });
app.get("/me", requireAuth(), ok);
app.get("/admin", requireAdmin(), ok);
app.get("/global", requireGlobalPermission("test.global"), ok);
app.get("/team", requireTeamAccess(), ok);
app.get("/:teamId/access", requireTeamAccess(), ok);
app.get("/:teamId/read", requireTeamAccess(), requirePermission("test.read"), ok);
app.get("/:teamId/write", requireTeamAccess(), requirePermission("test.write"), ok);
app.route("/", apiKeys);
app.route("/", rules);

const metadata = 'resource_metadata="https://recommand.example.com/.well-known/oauth-protected-resource/api"';

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions CASCADE");
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('member', 'member@example.com', 'unused', false),
    ('admin', 'admin@example.com', 'unused', true)`);
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two')");
  await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ('one', 'member'), ('two', 'member'), ('one', 'admin')");
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'test.read'), ('member', 'one', 'test.write'), ('member', 'two', 'test.read'),
    ('member', 'one', 'core.rules.read'), ('member', 'one', 'core.rules.write'), ('member', 'one', 'core.api_keys.read'),
    ('admin', 'one', 'test.read')`);
  await pool.query(`INSERT INTO user_global_permissions (user_id, permission_id) VALUES ('admin', 'test.global')`);
  await pool.query(`INSERT INTO oauth_clients (id, kind, grant_types, redirect_uris, token_endpoint_auth_method) VALUES
    ('dcr_app', 'dynamic', '{authorization_code}', '{https://app.example.com/callback}', 'none')`);
});

const tokenFor = async (userId: string, teamIds: string[], permissionIds: string[], resources: string[] = []) => {
  const { grant } = await createGrant({
    client: (await findClient("dcr_app"))!,
    permissionIds,
    teamIds,
    userId,
  });
  const { accessToken } = (await issueTokens({ grantId: grant.id, resources, withRefreshToken: false }))!;
  return { accessToken, grant };
};
const call = (path: string, token?: string) => {
  return app.request(path, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
};

describe("an OAuth access token", () => {
  test("reaches the teams of its grant, with the permissions it was granted", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read"]);
    expect((await call("/one/access", accessToken)).status).toBe(200);
    expect((await call("/one/read", accessToken)).status).toBe(200);
  });

  test("asks for a permission it wasn't granted", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read"]);
    const response = await call("/one/write", accessToken);
    expect(response.status).toBe(403);
    expect(response.headers.get("WWW-Authenticate")).toBe(`Bearer ${metadata}, error="insufficient_scope", scope="test.write"`);
  });

  test("doesn't reach a team outside its grant, or one its user left", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read"]);
    const other = await call("/two/access", accessToken);
    expect(other.status).toBe(403);
    expect(other.headers.get("WWW-Authenticate")).toBe(`Bearer ${metadata}, error="insufficient_scope"`);

    await pool.query("DELETE FROM team_members WHERE user_id = 'member' AND team_id = 'one'");
    expect((await call("/one/access", accessToken)).status).toBe(403);
  });

  test("never holds more than its user does now", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read", "test.write"]);
    expect((await call("/one/write", accessToken)).status).toBe(200);
    await pool.query("DELETE FROM user_permissions WHERE user_id = 'member' AND team_id = 'one' AND permission_id = 'test.write'");
    expect((await call("/one/write", accessToken)).status).toBe(403);
    expect((await call("/one/read", accessToken)).status).toBe(200);
  });

  test("addresses its grant's only team when the route names none", async () => {
    const { accessToken } = await tokenFor("member", ["two"], ["test.read"]);
    expect(await (await call("/team", accessToken)).json()).toEqual({ team: "two" });
  });

  test("sets up rules only with the permission the user grants deliberately", async () => {
    const send = (accessToken: string, method: string, path: string) =>
      app.request(path, {
        body: "{}",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        method,
      });
    const reader = await tokenFor("member", ["one"], ["core.rules.read"]);
    expect((await call("/one/rules", reader.accessToken)).status).toBe(200);
    const refused = await send(reader.accessToken, "POST", "/one/rules");
    expect(refused.status).toBe(403);
    expect(refused.headers.get("WWW-Authenticate")).toBe(`Bearer ${metadata}, error="insufficient_scope", scope="core.rules.write"`);
    expect((await send(reader.accessToken, "PATCH", "/one/rules/rule_unknown")).status).toBe(403);

    // Past the permission check, the empty body is what's wrong
    const writer = await tokenFor("member", ["one"], ["core.rules.read", "core.rules.write"]);
    expect((await send(writer.accessToken, "POST", "/one/rules")).status).toBe(400);
  });

  test("never carries admin access", async () => {
    const { accessToken } = await tokenFor("admin", ["one"], ["test.read"]);
    expect((await call("/admin", accessToken)).status).toBe(403);
    expect((await call("/global", accessToken)).status).toBe(403);
    expect((await call("/two/access", accessToken)).status).toBe(403);
    expect((await call("/one/read", accessToken)).status).toBe(200);
  });

  test("is refused where it would act for the user instead of a team, and can't get at API keys", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read"]);
    expect((await call("/me", accessToken)).status).toBe(403);
    expect((await call("/one/api-keys", accessToken)).status).toBe(403);
    // The member holds it, but a key would outlive the grant
    await expect(tokenFor("member", ["one"], ["core.api_keys.read"])).rejects.toThrow();
  });

  test("is only accepted when meant for this API", async () => {
    const forApi = await tokenFor("member", ["one"], ["test.read"], ["https://recommand.example.com/api"]);
    expect((await call("/one/access", forApi.accessToken)).status).toBe(200);

    const forOther = await tokenFor("member", ["one"], ["test.read"], ["https://other.example.com/"]);
    const response = await call("/one/access", forOther.accessToken);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(`Bearer ${metadata}, error="invalid_token"`);
  });

  test("is refused when another key signed it", async () => {
    const { accessToken, grant } = await tokenFor("member", ["one"], ["test.read"]);
    const { privateKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT(decodeJwt(accessToken)).setProtectedHeader({ alg: "RS256", typ: "at+jwt" }).sign(privateKey);
    // Even with a record for it, as if one had been stored
    await pool.query("INSERT INTO oauth_access_tokens (token_hash, expires_at, resources, grant_id) VALUES ($1, now() + interval '1 hour', '{}', $2)", [
      createHash("sha256").update(forged).digest("base64url"),
      grant.id,
    ]);
    expect((await call("/one/access", forged)).status).toBe(401);
  });

  test("stops working once expired, or once its grant is deleted", async () => {
    const expired = await tokenFor("member", ["one"], ["test.read"]);
    await pool.query("UPDATE oauth_access_tokens SET expires_at = now() - interval '1 second'");
    const response = await call("/one/access", expired.accessToken);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(`Bearer ${metadata}, error="invalid_token"`);

    const revoked = await tokenFor("member", ["one"], ["test.read"]);
    await deleteGrant(revoked.grant.id);
    expect((await call("/one/access", revoked.accessToken)).status).toBe(401);
  });

  test("stops working once its client is disabled", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read"]);
    expect((await call("/one/access", accessToken)).status).toBe(200);
    await pool.query("UPDATE oauth_clients SET disabled_at = now() WHERE id = 'dcr_app'");
    expect((await call("/one/access", accessToken)).status).toBe(401);
  });

  test("is read whatever the case of the scheme", async () => {
    const { accessToken } = await tokenFor("member", ["one"], ["test.read"]);
    const response = await app.request("/one/access", { headers: { Authorization: `bearer ${accessToken}` } });
    expect(response.status).toBe(200);
  });
});

test("a request without credentials learns where to find the API's metadata", async () => {
  const response = await call("/one/access");
  expect(response.status).toBe(401);
  expect(response.headers.get("WWW-Authenticate")).toBe(`Bearer ${metadata}`);
});
