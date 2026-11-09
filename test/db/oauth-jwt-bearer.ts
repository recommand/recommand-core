import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { pool, useTestDatabase } from "./harness";

process.env.BASE_URL = "https://recommand.example.com";
const { default: oauthToken } = await import("../../api/oauth/token");
const { listConnectedApps } = await import("../../data/oauth-grants");
const { verifyAccessToken } = await import("../../data/oauth-tokens");

const app = new Hono();
app.route("/", oauthToken);

const tokenEndpoint = "https://recommand.example.com/api/core/oauth/token";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions, audit_events CASCADE");
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('member', 'member@example.com', 'unused', false),
    ('admin', 'admin@example.com', 'unused', true),
    ('outsider', 'outsider@example.com', 'unused', false)`);
  await pool.query("INSERT INTO teams (id, name, client_assertion_jwks) VALUES ('one', 'One', $1)", [
    JSON.stringify({ keys: [{ ...(await exportJWK(publicKey)), alg: "RS256" }] }),
  ]);
  await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ('one', 'member'), ('one', 'admin')");
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'core.rules.read'), ('member', 'one', 'core.rules.write'), ('member', 'one', 'core.api_keys.read'),
    ('admin', 'one', 'core.rules.read')`);
});

const assertion = async ({
  audience = tokenEndpoint,
  expiresIn = "10m",
  key = privateKey,
  userId = "member",
}: { audience?: string; expiresIn?: string | null; key?: CryptoKey; userId?: string } = {}) => {
  const jwt = new SignJWT({ team_id: "one", user_id: userId })
    .setProtectedHeader({ alg: "RS256" })
    .setAudience(audience)
    .setIssuer("one")
    .setSubject("one");
  return (expiresIn ? jwt.setExpirationTime(expiresIn) : jwt).sign(key);
};

const token = async (fields: Record<string, string>) => {
  const response = await app.request("/oauth/token", { body: new URLSearchParams(fields), method: "POST" });
  return { body: (await response.json()) as any, status: response.status };
};
const exchange = async (signed: string, fields: Record<string, string> = {}) =>
  token({ assertion: signed, grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", ...fields });

describe("exchanging an assertion", () => {
  test("returns an access token with what the user can delegate in the team", async () => {
    const { body, status } = await exchange(await assertion());
    expect(status).toBe(200);
    expect(body).toMatchObject({ team_id: "one", team_name: "One", token_type: "Bearer" });
    expect(body.access_token).toStartWith("oat_");
    expect(body.refresh_token).toBeUndefined();
    // `core.api_keys.read` is never delegated, `core.rules.write` is opt-in
    expect(body.scope.split(" ").toSorted()).toEqual(["core.rules.read", "core.rules.write"]);
    const verified = await verifyAccessToken(body.access_token);
    expect(verified?.grant).toMatchObject({ clientId: null, userId: "member" });
  });

  test("expires with the assertion, an hour later at most", async () => {
    const short = await exchange(await assertion({ expiresIn: "10m" }));
    expect(short.body.expires_in).toBeWithin(598, 601);
    const long = await exchange(await assertion({ expiresIn: "3h" }));
    expect(long.body.expires_in).toBe(3_600);
  });

  test("accepts the issuer as the audience too", async () => {
    expect((await exchange(await assertion({ audience: "https://recommand.example.com" }))).status).toBe(200);
  });

  test("never carries admin access", async () => {
    const { body } = await exchange(await assertion({ userId: "admin" }));
    expect(body.scope).toBe("core.rules.read");
  });

  test("reuses one grant per team and user, following the user's current permissions", async () => {
    const first = (await exchange(await assertion())).body;
    await pool.query("DELETE FROM user_permissions WHERE user_id = 'member' AND permission_id = 'core.rules.write'");
    const second = (await exchange(await assertion())).body;
    expect(second.scope).toBe("core.rules.read");
    expect(Number((await pool.query("SELECT count(*) FROM oauth_grants WHERE client_id IS NULL")).rows[0].count)).toBe(1);
    expect((await verifyAccessToken(first.access_token))?.permissionIdsByTeam).toEqual(new Map([["one", ["core.rules.read"]]]));
    const events = await pool.query("SELECT action FROM audit_events WHERE object_type = 'core.oauth_grant'");
    expect(events.rows).toEqual([{ action: "create" }]);
  });

  test("exchanges at the same time share one grant", async () => {
    const first = await Promise.all([exchange(await assertion()), exchange(await assertion())]);
    expect(first.map(({ status }) => status)).toEqual([200, 200]);
    const again = await Promise.all([exchange(await assertion()), exchange(await assertion())]);
    expect(again.map(({ status }) => status)).toEqual([200, 200]);
    expect(Number((await pool.query("SELECT count(*) FROM oauth_grants WHERE client_id IS NULL")).rows[0].count)).toBe(1);
  });

  test("isn't listed as a connected app", async () => {
    await exchange(await assertion());
    expect(await listConnectedApps("member")).toEqual([]);
  });

  test("refuses an assertion it can't verify, or one without an expiry", async () => {
    const refused = [
      await assertion({ audience: "https://other.example.com" }),
      await assertion({ key: other.privateKey }),
      await assertion({ expiresIn: null }),
      await assertion({ userId: "outsider" }),
      "not-a-jwt",
    ];
    for (const signed of refused) {
      expect(await exchange(signed)).toMatchObject({ body: { error: "invalid_grant" }, status: 400 });
    }
  });

  test("refuses a user who can't delegate anything in the team", async () => {
    await pool.query("DELETE FROM user_permissions WHERE user_id = 'member' AND permission_id LIKE 'core.rules.%'");
    expect(await exchange(await assertion())).toMatchObject({ body: { error: "invalid_grant" }, status: 400 });
  });

  test("needs an assertion, and only issues tokens for this API", async () => {
    expect((await token({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer" })).body.error).toBe("invalid_request");
    expect((await exchange(await assertion(), { resource: "https://other.example.com/" })).body.error).toBe("invalid_target");
    expect((await exchange(await assertion(), { resource: "https://recommand.example.com/api" })).status).toBe(200);
  });
});
