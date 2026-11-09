import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AuthenticatedUserContext } from "../../lib/auth-middleware";
import { pool, useTestDatabase } from "./harness";

process.env.JWT_SECRET = "oauth-authorize-test-only-signing-key";
process.env.BASE_URL = "https://recommand.example.com";
const { createSession } = await import("../../lib/session");
const { default: oauthAuthorize } = await import("../../api/oauth/authorize");

const app = new Hono<AuthenticatedUserContext>();
app.get("/login/:userId", async (c) => {
  await createSession(c, { id: c.req.param("userId"), isAdmin: false });
  return c.json({ ok: true });
});
app.route("/", oauthAuthorize);

const request = {
  client_id: "dcr_app",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  redirect_uri: "https://app.example.com/callback",
  response_type: "code",
  scope: "core.rules.read core.rules.write",
  state: "xyz",
};

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients CASCADE");
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('member', 'member@example.com', 'unused', false),
    ('admin', 'admin@example.com', 'unused', true)`);
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two')");
  await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ('one', 'member')");
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'core.rules.read'), ('member', 'one', 'core.rules.write')`);
  await pool.query(`INSERT INTO oauth_clients (id, kind, name, grant_types, redirect_uris, token_endpoint_auth_method) VALUES
    ('dcr_app', 'dynamic', 'Example', '{authorization_code}', '{https://app.example.com/callback}', 'none')`);
});

const cookie = async (userId = "member") => {
  const response = await app.request(`/login/${userId}`);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
};
const show = async (parameters: Record<string, string> = request, userId = "member") => {
  const response = await app.request(`/oauth/authorize?${new URLSearchParams(parameters)}`, { headers: await cookie(userId) });
  return { body: (await response.json()) as any, status: response.status };
};
const decide = async (teamId: string | null, permissionIds?: string[], parameters: Record<string, string> = request) => {
  const response = await app.request("/oauth/authorize", {
    body: JSON.stringify({ parameters, permissionIds, teamId }),
    headers: { ...(await cookie()), "Content-Type": "application/json" },
    method: "POST",
  });
  return { body: (await response.json()) as any, status: response.status };
};
const codes = async () => (await pool.query("SELECT * FROM oauth_authorization_codes")).rows;

describe("showing the consent screen", () => {
  test("needs a signed-in user", async () => {
    const response = await app.request(`/oauth/authorize?${new URLSearchParams(request)}`);
    expect(response.status).toBe(401);
  });

  test("refuses an API key, since only someone signed in to the dashboard consents", async () => {
    const secretHash = await Bun.password.hash("secret", { algorithm: "bcrypt", cost: 4 });
    await pool.query(`INSERT INTO api_keys (id, name, user_id, team_id, type, secret_hash) VALUES
      ('key_member', 'Key', 'member', 'one', 'basic', $1)`, [secretHash]);
    const headers = { Authorization: `Basic ${btoa("key_member:secret")}` };
    expect((await app.request(`/oauth/authorize?${new URLSearchParams(request)}`, { headers })).status).toBe(401);
    const response = await app.request("/oauth/authorize", {
      body: JSON.stringify({ parameters: request, teamId: "one" }),
      headers: { ...headers, "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(401);
    expect(await codes()).toEqual([]);
  });

  test("warns when this request returns to a program on the user's computer", async () => {
    await pool.query(`UPDATE oauth_clients SET redirect_uris = '{https://app.example.com/callback,http://127.0.0.1/callback}' WHERE id = 'dcr_app'`);
    expect((await show()).body.consent.isLoopbackRedirect).toBe(false);
    expect((await show({ ...request, redirect_uri: "http://127.0.0.1:4567/callback" })).body.consent.isLoopbackRedirect).toBe(true);
  });

  test("offers the user's own teams, also to an admin", async () => {
    const { body } = await show();
    expect(body.consent).toMatchObject({
      client: { host: null, name: "Example" },
      isLoopbackRedirect: false,
      permissions: [
        { delegation: "all", id: "core.rules.read", resource: "Rules" },
        { delegation: "opt_in", id: "core.rules.write", resource: "Rules" },
      ],
      redirectHost: "app.example.com",
      teams: [{ id: "one", name: "One", permissionIds: ["core.rules.read", "core.rules.write"] }],
    });
    expect((await show(request, "admin")).body.consent.teams).toEqual([]);
  });

  test("refuses a redirect URI the client didn't register, without redirecting", async () => {
    const { body, status } = await show({ ...request, redirect_uri: "https://evil.example.com/callback" });
    expect(status).toBe(400);
    expect(body.redirectTo).toBeUndefined();
  });

  test("sends other errors back to the client", async () => {
    const { body } = await show({ ...request, code_challenge_method: "plain" });
    const redirect = new URL(body.redirectTo);
    expect(redirect.origin + redirect.pathname).toBe(request.redirect_uri);
    expect(Object.fromEntries(redirect.searchParams)).toMatchObject({
      error: "invalid_request",
      iss: "https://recommand.example.com",
      state: "xyz",
    });
  });
});

describe("deciding on the request", () => {
  test("approving returns a code for the chosen team", async () => {
    const { body } = await decide("one");
    const redirect = new URL(body.redirectTo);
    const code = redirect.searchParams.get("code")!;
    expect(redirect.searchParams.get("state")).toBe("xyz");
    expect(redirect.searchParams.get("iss")).toBe("https://recommand.example.com");

    const [stored] = await codes();
    expect(stored).toMatchObject({
      client_id: "dcr_app",
      code_challenge: request.code_challenge,
      // Without a choice, what the consent screen ticks: not the opt-in permission
      permission_ids: ["core.rules.read"],
      redirect_uri: request.redirect_uri,
      team_ids: ["one"],
      user_id: "member",
    });
    expect(stored.code_hash).not.toBe(code);
  });

  test("grants an opt-in permission only when the user chose it", async () => {
    await decide("one", ["core.rules.read", "core.rules.write"]);
    expect((await codes())[0].permission_ids).toEqual(["core.rules.read", "core.rules.write"]);
  });

  test("grants nothing beyond what the team offered", async () => {
    // The member doesn't hold it, and the client didn't ask for it
    await decide("one", ["core.rules.read", "core.api_keys.read"]);
    expect((await codes())[0].permission_ids).toEqual(["core.rules.read"]);
    const { status } = await decide("one", ["core.api_keys.read"]);
    expect(status).toBe(400);
  });

  test("refuses a team the user isn't a member of", async () => {
    const { status } = await decide("two");
    expect(status).toBe(400);
    expect(await codes()).toEqual([]);
  });

  test("denying tells the client, and stores nothing", async () => {
    const { body } = await decide(null);
    expect(new URL(body.redirectTo).searchParams.get("error")).toBe("access_denied");
    expect(await codes()).toEqual([]);
  });
});
