import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { pool, useTestDatabase } from "./harness";

const { default: oauthToken } = await import("../../api/oauth/token");
const { default: jwks } = await import("../../api/jwks");
const { default: oauthRevoke } = await import("../../api/oauth/revoke");
const { createAuthorizationCode } = await import("../../data/oauth-authorization-codes");
const { findGrant } = await import("../../data/oauth-grants");
const { issueTokens } = await import("../../data/oauth-tokens");

const app = new Hono();
app.route("/", oauthToken);
app.route("/", jwks);
app.route("/", oauthRevoke);

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
const refresh = (refreshToken: string, clientId = "dcr_app") =>
  token({ client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken });
const count = async (table: string) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

describe("exchanging a code", () => {
  test("returns an access token as a JWT that the published keys verify", async () => {
    const { body } = await exchange(await authorize());
    expect(decodeJwt(body.access_token)).toMatchObject({
      aud: "https://recommand.example.com/api",
      client_id: "dcr_app",
      iss: "https://recommand.example.com",
      scope: "core.rules.read",
      sub: "member",
    });
    const keys = await (await app.request("/.well-known/jwks.json")).json();
    expect((await jwtVerify(body.access_token, createLocalJWKSet(keys), { typ: "at+jwt" })).protectedHeader.kid).toBe(keys.keys[0].kid);
  });

  test("creates the grant and returns tokens for its team", async () => {
    const { body, headers, status } = await exchange(await authorize());
    expect(status).toBe(200);
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({ expires_in: 3_600, scope: "core.rules.read", team_id: "one", team_name: "One", token_type: "Bearer" });
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
    expect(second.body.team_id).toBe("one");
  });

  test("deletes the grant when a replaced token comes back", async () => {
    const first = (await exchange(await authorize())).body;
    const second = (await refresh(first.refresh_token)).body;
    const [{ id }] = (await pool.query("SELECT id FROM oauth_grants")).rows;
    expect((await refresh(first.refresh_token)).body.error).toBe("invalid_grant");

    expect(await findGrant(id)).toBeNull();
    expect((await refresh(second.refresh_token)).body.error).toBe("invalid_grant");
    expect(await count("oauth_access_tokens")).toBe(0);
    expect(await count("oauth_refresh_tokens")).toBe(0);
  });

  test("only works for the client it was issued to", async () => {
    await pool.query("UPDATE oauth_clients SET grant_types = '{authorization_code,refresh_token}' WHERE id = 'dcr_other'");
    const first = (await exchange(await authorize())).body;
    expect((await refresh(first.refresh_token, "dcr_other")).body.error).toBe("invalid_grant");
    expect((await refresh(first.refresh_token)).status).toBe(200);
  });
});

test("no tokens are issued for a grant that was deleted meanwhile", async () => {
  expect(await issueTokens({ grantId: "grt_deleted", resources: [], withRefreshToken: true })).toBeNull();
  expect(await count("oauth_access_tokens")).toBe(0);
});

describe("revoking", () => {
  const revoke = async (fields: Record<string, string>) => {
    const response = await app.request("/oauth/revoke", { body: new URLSearchParams(fields), method: "POST" });
    return { body: await response.text(), status: response.status };
  };

  test("a refresh token ends the whole grant", async () => {
    const tokens = (await exchange(await authorize())).body;
    expect(await revoke({ client_id: "dcr_app", token: tokens.refresh_token })).toEqual({ body: "", status: 200 });
    expect((await refresh(tokens.refresh_token)).body.error).toBe("invalid_grant");
    expect(await count("oauth_access_tokens")).toBe(0);
  });

  test("an access token ends only itself", async () => {
    const tokens = (await exchange(await authorize())).body;
    expect((await revoke({ client_id: "dcr_app", token: tokens.access_token })).status).toBe(200);
    expect(await count("oauth_access_tokens")).toBe(0);
    expect((await refresh(tokens.refresh_token)).status).toBe(200);
  });

  test("answers the same for another client's or an unknown token", async () => {
    const tokens = (await exchange(await authorize())).body;
    expect(await revoke({ client_id: "dcr_other", token: tokens.refresh_token })).toEqual({ body: "", status: 200 });
    expect(await revoke({ client_id: "dcr_app", token: "ort_unknown" })).toEqual({ body: "", status: 200 });
    expect((await refresh(tokens.refresh_token)).status).toBe(200);
  });

  test("needs a known client and a token", async () => {
    expect((await revoke({ client_id: "dcr_unknown", token: "ort_x" })).status).toBe(400);
    expect(JSON.parse((await revoke({ client_id: "dcr_app" })).body).error).toBe("invalid_request");
  });
});
