import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { pool, useTestDatabase } from "./harness";

const { default: oauthToken } = await import("../../api/oauth/token");
const { createAuthorizationCode } = await import("../../data/oauth-authorization-codes");
const { findGrant } = await import("../../data/oauth-grants");
const { issueTokens } = await import("../../data/oauth-tokens");
const { getPublicKeySet } = await import("../../lib/signing-keys");

const app = new Hono();
app.route("/", oauthToken);

// RFC 7636, appendix B
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const redirectUri = "https://app.example.com/callback";

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions, audit_events CASCADE");
  await pool.query("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('member', 'member@example.com', 'unused', false)");
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One')");
  await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ('one', 'member')");
  await pool.query("INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES ('member', 'one', 'core.rules.read')");
  await pool.query(`INSERT INTO oauth_clients (id, kind, grant_types, redirect_uris, token_endpoint_auth_method) VALUES
    ('dcr_app', 'dynamic', '{authorization_code,refresh_token}', '{${redirectUri}}', 'none'),
    ('dcr_other', 'dynamic', '{authorization_code}', '{${redirectUri}}', 'none')`);
});

const authorize = (clientId = "dcr_app", resources: string[] = []) =>
  createAuthorizationCode({
    clientId,
    codeChallenge,
    permissionIds: ["core.rules.read"],
    redirectUri,
    resources,
    teamIds: ["one"],
    userId: "member",
  });

const token = async (fields: Record<string, string | string[]>) => {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([name, value]) => [value].flat().forEach((item) => body.append(name, item)));
  const response = await app.request("/oauth/token", { body, method: "POST" });

  return { body: (await response.json()) as any, headers: response.headers, status: response.status };
};
const exchange = async (code: string, fields: Record<string, string | string[]> = {}) =>
  token({ client_id: "dcr_app", code, code_verifier: codeVerifier, grant_type: "authorization_code", redirect_uri: redirectUri, ...fields });
const refresh = (refreshToken: string, clientId = "dcr_app", fields: Record<string, string | string[]> = {}) =>
  token({ client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken, ...fields });
const count = async (table: string) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

describe("exchanging a code", () => {
  test("returns an access token as a JWT that the platform's public keys verify", async () => {
    const { body } = await exchange(await authorize());
    expect(decodeJwt(body.access_token)).toMatchObject({
      aud: "https://recommand.example.com/api",
      client_id: "dcr_app",
      iss: "https://recommand.example.com",
      scope: "core.rules.read",
      sub: "member",
    });
    const keys = await getPublicKeySet();
    expect((await jwtVerify(body.access_token, createLocalJWKSet(keys), { typ: "at+jwt" })).protectedHeader.kid).toBe(keys.keys[0].kid);
  });

  test("creates the grant and returns tokens for its team", async () => {
    const { body, headers, status } = await exchange(await authorize());
    expect(status).toBe(200);
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      expires_in: 3_600,
      scope: "core.rules.read",
      teams: [{ id: "one", name: "One", scope: "core.rules.read" }],
      token_type: "Bearer",
    });
    expect(decodeProtectedHeader(body.access_token).typ).toBe("at+jwt");
    expect(body.refresh_token).toStartWith("ort_");

    const { rows } = await pool.query("SELECT token_hash FROM oauth_access_tokens");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(body.access_token);
    expect(await count("oauth_grants")).toBe(1);
  });

  test("works only once, even when the first attempt fails", async () => {
    const code = await authorize();
    expect((await exchange(code, { code_verifier: "x".repeat(43) })).body.error).toBe("invalid_grant");
    expect((await exchange(code)).body.error).toBe("invalid_grant");

    const used = await authorize();
    expect((await exchange(used)).status).toBe(200);
    expect((await exchange(used)).body.error).toBe("invalid_grant");
  });

  test("deletes the grant it gave when it comes back", async () => {
    const code = await authorize();
    const first = (await exchange(code)).body;
    const [{ id }] = (await pool.query("SELECT id FROM oauth_grants")).rows;
    expect((await exchange(code)).body.error).toBe("invalid_grant");

    expect(await findGrant(id)).toBeNull();
    expect(await count("oauth_grants")).toBe(0);
    expect((await refresh(first.refresh_token)).body.error).toBe("invalid_grant");
    expect(await count("oauth_access_tokens")).toBe(0);
    const { rows } = await pool.query("SELECT action, object_id, reason_code FROM audit_events WHERE reason_code = 'authorization_code_reused'");
    expect(rows).toEqual([{ action: "revoke_access", object_id: id, reason_code: "authorization_code_reused" }]);
  });

  test("leaves the grant when it comes back without what the exchange needed", async () => {
    const code = await authorize();
    expect((await exchange(code)).status).toBe(200);
    const invalid: Record<string, string>[] = [{ code_verifier: "x".repeat(43) }, { client_id: "dcr_other" }, { redirect_uri: "https://app.example.com/other" }];
    const replays = await Promise.all(invalid.map((fields) => exchange(code, fields)));
    expect(replays.map((replay) => replay.body.error)).toEqual(["invalid_grant", "invalid_grant", "invalid_grant"]);
    expect(await count("oauth_grants")).toBe(1);
    expect((await exchange(code)).body.error).toBe("invalid_grant");
    expect(await count("oauth_grants")).toBe(0);
  });

  test("needs the same client and redirect URI", async () => {
    expect((await exchange(await authorize(), { client_id: "dcr_other" })).body.error).toBe("invalid_grant");
    expect((await exchange(await authorize(), { redirect_uri: "https://app.example.com/other" })).body.error).toBe("invalid_grant");
    expect((await exchange(await authorize(), { client_id: "dcr_unknown" })).body.error).toBe("invalid_client");
  });

  test("refuses an expired code", async () => {
    const code = await authorize();
    await pool.query("UPDATE oauth_authorization_codes SET expires_at = now() - interval '1 second'");
    expect((await exchange(code)).body.error).toBe("invalid_grant");
  });

  test("refuses when the user left the team since consenting", async () => {
    const code = await authorize();
    await pool.query("DELETE FROM team_members");
    expect((await exchange(code)).body.error).toBe("invalid_grant");
    expect(await count("oauth_grants")).toBe(0);
  });

  test("narrows to the authorized resources, never widens", async () => {
    const resources = ["https://api.example.com/", "https://mcp.example.com/"];
    expect((await exchange(await authorize("dcr_app", resources), { resource: "https://evil.example.com/" })).body.error).toBe("invalid_target");
    expect((await exchange(await authorize("dcr_app", resources), { resource: "https://mcp.example.com/" })).status).toBe(200);
    expect((await pool.query("SELECT resources FROM oauth_access_tokens")).rows).toEqual([{ resources: ["https://mcp.example.com/"] }]);
  });

  test("gives no refresh token to a client that didn't register for one", async () => {
    const { body } = await exchange(await authorize("dcr_other"), { client_id: "dcr_other" });
    expect(body.refresh_token).toBeUndefined();
    expect((await refresh("ort_anything", "dcr_other")).body.error).toBe("unauthorized_client");
  });

  test("refuses other grant types", async () => {
    expect((await token({ client_id: "dcr_app", grant_type: "password" })).body.error).toBe("unsupported_grant_type");
  });
});

describe("refreshing", () => {
  test("replaces the refresh token", async () => {
    const first = (await exchange(await authorize())).body;
    const second = await refresh(first.refresh_token);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).not.toBe(first.refresh_token);
    expect(second.body.access_token).not.toBe(first.access_token);
    expect(second.body.teams).toEqual([{ id: "one", name: "One", scope: "core.rules.read" }]);
  });

  test("deletes the grant when a replaced token comes back", async () => {
    const first = (await exchange(await authorize())).body;
    const second = (await refresh(first.refresh_token)).body;
    const [{ id }] = (await pool.query("SELECT id FROM oauth_grants")).rows;
    await pool.query("UPDATE oauth_refresh_tokens SET used_at = used_at - interval '11 seconds' WHERE used_at IS NOT NULL");
    expect((await refresh(first.refresh_token)).body.error).toBe("invalid_grant");

    expect(await findGrant(id)).toBeNull();
    expect((await refresh(second.refresh_token)).body.error).toBe("invalid_grant");
    expect(await count("oauth_access_tokens")).toBe(0);
    expect(await count("oauth_refresh_tokens")).toBe(0);
    const { rows } = await pool.query("SELECT object_id, object_type, metadata FROM audit_events WHERE reason_code = 'refresh_token_reused'");
    expect(rows).toEqual([
      { metadata: expect.objectContaining({ clientId: "dcr_app", teamIds: ["one"], userId: "member" }), object_id: id, object_type: "core.oauth_grant" },
    ]);
  });

  test("keeps the grant when a replaced token comes back within seconds", async () => {
    const first = (await exchange(await authorize())).body;
    const second = (await refresh(first.refresh_token)).body;
    expect((await refresh(first.refresh_token)).body.error).toBe("invalid_grant");
    expect(await count("oauth_grants")).toBe(1);
    expect((await refresh(second.refresh_token)).status).toBe(200);
  });

  test("refuses an expired refresh token", async () => {
    const first = (await exchange(await authorize())).body;
    await pool.query("UPDATE oauth_refresh_tokens SET expires_at = now() - interval '1 second'");
    expect((await refresh(first.refresh_token)).body.error).toBe("invalid_grant");
  });

  test("is never cached", async () => {
    const first = await exchange(await authorize());
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect((await refresh(first.body.refresh_token)).headers.get("Cache-Control")).toBe("no-store");
  });

  test("narrows the access token to the refresh token's resources, never widens", async () => {
    const resources = ["https://api.example.com/", "https://mcp.example.com/"];
    const first = (await exchange(await authorize("dcr_app", resources), { resource: "https://mcp.example.com/" })).body;
    expect((await refresh(first.refresh_token, "dcr_app", { resource: "https://evil.example.com/" })).body.error).toBe("invalid_target");

    const second = (await refresh(first.refresh_token, "dcr_app", { resource: "https://api.example.com/" })).body;
    await refresh(second.refresh_token);

    const { rows } = await pool.query("SELECT resources FROM oauth_access_tokens");
    // The code's token, the narrowed refresh and the one that asked for nothing
    expect(rows.map((row) => row.resources).toSorted()).toEqual([[resources[0]], resources, [resources[1]]]);
  });

  test("only works for the client it was issued to", async () => {
    await pool.query("UPDATE oauth_clients SET grant_types = '{authorization_code,refresh_token}' WHERE id = 'dcr_other'");
    const first = (await exchange(await authorize())).body;
    expect((await refresh(first.refresh_token, "dcr_other")).body.error).toBe("invalid_grant");
    expect((await refresh(first.refresh_token)).status).toBe(200);
  });
});

test("without a key to sign with, answers 503 and leaves the code to redeem later", async () => {
  const code = await authorize();
  const settings = { SIGNING_KEYS: process.env.SIGNING_KEYS };
  delete process.env.SIGNING_KEYS;
  const refused = await exchange(code);
  Object.assign(process.env, settings);
  expect([refused.status, refused.body.error]).toEqual([503, "temporarily_unavailable"]);
  expect(await count("oauth_grants")).toBe(0);
  expect((await exchange(code)).status).toBe(200);
});

test("refreshing one token twice at once keeps one of the two, and the grant", async () => {
  const first = (await exchange(await authorize())).body;
  const statuses = (await Promise.all([refresh(first.refresh_token), refresh(first.refresh_token)])).map((result) => result.status);
  expect(statuses.toSorted()).toEqual([200, 400]);
  expect(await count("oauth_grants")).toBe(1);
});

test("only stored, enabled clients reach the token endpoint, and none is stored there", async () => {
  await pool.query("UPDATE oauth_clients SET disabled_at = now() WHERE id = 'dcr_other'");
  const urlClient = "https://client.example.com/metadata.json";
  const answers = await Promise.all([urlClient, "dcr_other"].map(async (clientId) => (await token({ client_id: clientId, grant_type: "refresh_token", refresh_token: "ort_x" })).body.error));
  expect(answers).toEqual(["invalid_client", "invalid_client"]);
  expect((await pool.query("SELECT id FROM oauth_clients WHERE id = $1", [urlClient])).rows).toEqual([]);
});

test("no tokens are issued for a grant that was deleted meanwhile", async () => {
  expect(await issueTokens({ grantId: "grt_deleted", resources: [], withRefreshToken: true })).toBeNull();
  expect(await count("oauth_access_tokens")).toBe(0);
});
