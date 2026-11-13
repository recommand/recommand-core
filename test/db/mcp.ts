import { beforeEach, describe, expect, test } from "bun:test";
import bcrypt from "bcrypt";
import { Hono } from "hono";
import { describeRoute, generateSpecs } from "hono-openapi";
import { z } from "zod";
import type { AuthenticatedUserContext } from "../../lib/auth-middleware";
import { pool, useTestDatabase } from "./harness";

process.env.JWT_SECRET = "mcp-test-only-signing-key";
process.env.BASE_URL = "https://recommand.example.com";
const { default: mcp } = await import("../../api/mcp");
const { findClient } = await import("../../data/oauth-clients");
const { createGrant } = await import("../../data/oauth-grants");
const { issueTokens } = await import("../../data/oauth-tokens");
const { requireAuth } = await import("../../lib/auth-middleware");
const { registerPermission } = await import("../../lib/permissions");
const { requirePermission } = await import("../../lib/permissions/permission-middleware");
const { McpToolError, registerOperations, registerTool } = await import("../../lib/mcp/tools");
const { createSession } = await import("../../lib/session");

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "all", id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });

// The tools take their permissions from the API operations they name, as the routes document them
const api = new Hono();
api.get("/test", describeRoute({ operationId: "readTest" }), requirePermission("test.read"), (c) => c.body(null));
api.post("/test", describeRoute({ operationId: "writeTest" }), requirePermission("test.write"), (c) => c.body(null));
registerOperations(() => generateSpecs(api));

registerTool({
  annotations: { openWorldHint: false, readOnlyHint: true },
  description: "Echo the team and the input.",
  handler: async ({ team }, input) => {
    if (input.text === "missing") {
      throw new McpToolError("Nothing found", "not_found");
    }

    return { input, team: team.id };
  },
  input: z.object({
    count: z.number().int().optional(),
    loud: z.boolean().optional(),
    note: z.string().optional(),
    text: z.string(),
  }),
  name: "echo",
  operations: ["readTest"],
  title: "Echo",
});
registerTool({
  annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: false },
  description: "Return a result too large to hand back.",
  handler: async () => ({ text: "x".repeat(60_000) }),
  input: z.object({}),
  name: "large_result",
  operations: ["writeTest"],
  title: "Large",
});
registerTool({
  annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false },
  description: "Read something and write it back.",
  handler: async () => ({ copied: true }),
  input: z.object({}),
  name: "copy",
  operations: ["readTest", "writeTest"],
  title: "Copy",
});
registerTool({
  annotations: { openWorldHint: false, readOnlyHint: true },
  description: "Name an operation no document describes.",
  handler: async () => ({}),
  input: z.object({}),
  name: "broken",
  operations: ["missingOperation"],
  title: "Broken",
});

const app = new Hono<AuthenticatedUserContext>();
app.route("/", mcp);
app.get("/api/me", requireAuth(), (c) => c.body(null));
app.get("/sign-in", async (c) => {
  await createSession(c, { id: "member", isAdmin: false });

  return c.body(null);
});

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions, audit_events CASCADE");
  await pool.query("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('member', 'member@example.com', 'unused', false)");
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two'), ('three', 'Three')");
  await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ('one', 'member'), ('two', 'member')");
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'test.read'), ('member', 'one', 'test.write'), ('member', 'two', 'test.read')`);
  await pool.query(`INSERT INTO oauth_clients (id, kind, grant_types, redirect_uris, token_endpoint_auth_method) VALUES
    ('dcr_app', 'dynamic', '{authorization_code}', '{https://app.example.com/callback}', 'none')`);
});

const mcpResource = "https://recommand.example.com/mcp";

const bearer = async (teamIds: string[], permissionIds: string[], resources = [mcpResource]) => {
  const { grant } = await createGrant({ client: (await findClient("dcr_app"))!, permissionIds, teamIds, userId: "member" });
  const { accessToken } = (await issueTokens({ grantId: grant.id, resources, withRefreshToken: false }))!;

  return `Bearer ${accessToken}`;
};

const basic = async (permissionIds: string[]) => {
  await pool.query(
    `INSERT INTO api_keys (id, name, user_id, team_id, type, secret_hash) VALUES ('key', 'Key', 'member', 'one', 'basic', $1)`,
    [await bcrypt.hash("secret", 4)]
  );
  for (const permissionId of permissionIds) {
    await pool.query(
      `INSERT INTO principal_permissions (principal_type, principal_id, team_id, permission_id) VALUES ('api_key', 'key', 'one', $1)`,
      [permissionId]
    );
  }

  return `Basic ${btoa("key:secret")}`;
};

const post = (authorization: string | null, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  app.request("/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
      ...(authorization ? { Authorization: authorization } : {}),
      ...headers,
    },
    method: "POST",
  });

/** A request in the 2026-07-28 protocol, which carries its envelope on every request. */
const postModern = (authorization: string, method: string, params: Record<string, unknown> = {}) =>
  app.request("/mcp", {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        },
      },
    }),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: authorization,
      "Content-Type": "application/json",
      "Mcp-Method": method,
      "MCP-Protocol-Version": "2026-07-28",
    },
    method: "POST",
  });

const message = async (authorization: string, method: string, params?: Record<string, unknown>) => {
  const response = await post(authorization, method, params);
  expect(response.status).toBe(200);
  const text = await response.text();
  // A response streamed as server-sent events carries its message on a `data:` line
  const body = text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))!.slice(6);

  return JSON.parse(body) as { error?: { code: number; message: string }; result?: any };
};

const rpc = async (authorization: string, method: string, params?: Record<string, unknown>) =>
  (await message(authorization, method, params)).result;

const listedTools = async (authorization: string) =>
  ((await rpc(authorization, "tools/list")).tools as { name: string }[]).map((tool) => tool.name);

const callTool = async (authorization: string, name: string, args: Record<string, unknown> = {}) =>
  (await rpc(authorization, "tools/call", { arguments: args, name })) as {
    isError?: boolean;
    structuredContent: Record<string, unknown>;
  };

describe("the MCP endpoint", () => {
  test("tells a client without credentials where to sign in", async () => {
    const response = await post(null, "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="https://recommand.example.com/.well-known/oauth-protected-resource/mcp"'
    );
  });

  test("refuses a token meant for the API", async () => {
    const response = await post(await bearer(["one"], ["test.read"], ["https://recommand.example.com/api"]), "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });

  test("refuses a token issued without a resource, which is meant for the API", async () => {
    const response = await post(await bearer(["one"], ["test.read"], []), "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });

  test("issues tokens that work on the MCP server only, not on the API", async () => {
    const response = await app.request("/api/me", { headers: { Authorization: await bearer(["one"], ["test.read"]) } });
    expect(response.status).toBe(401);
  });

  test("refuses a browser session, which a page on another site could make calls with", async () => {
    const cookie = (await app.request("/sign-in")).headers.get("set-cookie")!.split(";")[0]!;
    const response = await post(null, "tools/list", {}, { Cookie: cookie });
    expect(response.status).toBe(401);
    const { rows } = await pool.query("SELECT reason_code FROM audit_events WHERE object_type = 'core.route'");
    expect(rows).toEqual([{ reason_code: "session_refused" }]);
  });

  test("refuses a browser request from another site, and takes one from its own", async () => {
    const authorization = await basic(["test.read"]);
    expect((await post(authorization, "tools/list", {}, { Origin: "https://attacker.example" })).status).toBe(403);
    expect((await post(authorization, "tools/list", {}, { Origin: "https://recommand.example.com" })).status).toBe(200);
  });

  test("lists the tools whose permissions the credential holds in one of its teams", async () => {
    expect(await listedTools(await bearer(["one", "two"], ["test.read"]))).toEqual(["list_teams", "echo"]);
    expect(await listedTools(await bearer(["two"], ["test.read", "test.write"]))).toEqual(["list_teams", "echo"]);
    expect(await listedTools(await basic(["test.read", "test.write"]))).toEqual(["list_teams", "echo", "large_result", "copy"]);
  });

  test("serves the 2026-07-28 protocol too", async () => {
    const response = await postModern(await basic(["test.read"]), "tools/list");
    expect(response.status).toBe(200);
    expect(((await response.json()).result.tools as { name: string }[]).map((tool) => tool.name)).toEqual([
      "list_teams",
      "echo",
    ]);
  });

  test("opens no streams, since it sends nothing of its own", async () => {
    const authorization = await basic(["test.read"]);
    const listen = await postModern(authorization, "subscriptions/listen", { notifications: { toolsListChanged: true } });
    expect(listen.headers.get("Content-Type")).not.toContain("text/event-stream");
    expect((await listen.json()).error).toEqual({ code: -32_601, message: "Method not found" });
    const get = await app.request("/mcp", { headers: { Accept: "text/event-stream", Authorization: authorization } });
    expect(get.status).toBe(405);
  });

  test("lists the teams the credential reaches", async () => {
    const authorization = await bearer(["one", "two"], ["test.read"]);
    expect((await callTool(authorization, "list_teams")).structuredContent).toEqual({
      teams: [
        { id: "one", name: "One" },
        { id: "two", name: "Two" },
      ],
    });
  });

  test("acts in the only team, or the one named, and needs one when there are several", async () => {
    expect((await callTool(await basic(["test.read"]), "echo", { text: "hi" })).structuredContent).toEqual({
      input: { text: "hi" },
      team: "one",
    });
    const authorization = await bearer(["one", "two"], ["test.read"]);
    expect((await callTool(authorization, "echo", { teamId: "two", text: "hi" })).structuredContent.team).toBe("two");
    const unnamed = await callTool(authorization, "echo", { text: "hi" });
    expect(unnamed.isError).toBe(true);
    expect(unnamed.structuredContent.code).toBe("team_required");
  });

  test("says so when the credential reaches no team", async () => {
    const authorization = await bearer(["one"], ["test.read"]);
    await pool.query("DELETE FROM team_members WHERE team_id = 'one'");
    expect((await callTool(authorization, "echo", { text: "hi" })).structuredContent).toEqual({
      code: "team_not_reachable",
      message: "This connection doesn't reach any team, so there's none to act in.",
    });
  });

  test("checks the team and the permission on every call", async () => {
    const authorization = await bearer(["one", "two"], ["test.read"]);
    expect((await callTool(authorization, "echo", { teamId: "three", text: "hi" })).structuredContent.code).toBe(
      "team_not_reachable"
    );
    expect((await callTool(authorization, "large_result", { teamId: "one" })).structuredContent.code).toBe(
      "insufficient_permission"
    );
  });

  test("needs every permission of the operations a tool names, and says which are missing", async () => {
    expect((await callTool(await bearer(["one"], ["test.read"]), "copy")).structuredContent).toEqual({
      code: "insufficient_permission",
      message: "This connection lacks the test.write permission in team one.",
    });
    expect((await callTool(await basic([]), "copy")).structuredContent).toEqual({
      code: "insufficient_permission",
      message: "This connection lacks the test.read and test.write permissions in team one.",
    });
    expect((await callTool(await bearer(["one"], ["test.read", "test.write"]), "copy")).structuredContent).toEqual({ copied: true });
  });

  test("audits a call to a team the credential doesn't reach outside that team", async () => {
    await callTool(await bearer(["one"], ["test.read"]), "echo", { teamId: "three", text: "hi" });
    await callTool(await basic(["test.read"]), "echo", { teamId: "three", text: "hi" });
    const { rows } = await pool.query(
      "SELECT reason_code, team_id FROM audit_events WHERE object_type = 'core.mcp_tool' ORDER BY reason_code"
    );
    expect(rows).toEqual([
      { reason_code: "not_team_member", team_id: null },
      { reason_code: "team_id_mismatch", team_id: "one" },
    ]);
  });

  test("answers a call to a tool that doesn't exist with a protocol error", async () => {
    const { error } = await message(await basic(["test.read"]), "tools/call", { arguments: {}, name: "missing" });
    expect(error).toEqual({ code: -32_602, message: "Unknown tool: missing" });
  });

  test("leaves out a tool whose permissions can't be worked out, and refuses to call it", async () => {
    const authorization = await basic(["test.read", "test.write"]);
    expect(await listedTools(authorization)).not.toContain("broken");
    const { error } = await message(authorization, "tools/call", { arguments: {}, name: "broken" });
    expect(error?.code).toBe(-32_603);
  });

  test("treats empty strings as not given", async () => {
    const result = await callTool(await basic(["test.read"]), "echo", { note: "", teamId: "", text: "hi" });
    expect(result.structuredContent).toEqual({ input: { text: "hi" }, team: "one" });
  });

  test("answers an unexpected failure with a generic error, without its message", async () => {
    await pool.query("UPDATE users SET is_admin = true WHERE id = 'member'");
    // PostgreSQL can't store a NUL character, so the permission check fails
    const { error } = await message(await basic(["test.read"]), "tools/call", {
      arguments: { teamId: "one\u0000", text: "hi" },
      name: "echo",
    });
    expect(error).toEqual({ code: -32_603, message: "Internal error" });
  });

  test("takes a number or a boolean sent as a string", async () => {
    const authorization = await basic(["test.read"]);
    expect((await callTool(authorization, "echo", { count: "5", loud: "false", text: "hi" })).structuredContent.input).toEqual({
      count: 5,
      loud: false,
      text: "hi",
    });
    expect((await callTool(authorization, "echo", { count: "five", text: "hi" })).structuredContent.code).toBe("invalid_input");
    expect((await callTool(authorization, "echo", { loud: "yes", text: "hi" })).structuredContent.code).toBe("invalid_input");
  });

  test("hands back invalid input, a tool's own failure and a result too large as errors the model can act on", async () => {
    const authorization = await basic(["test.read", "test.write"]);
    const invalid = await callTool(authorization, "echo", {});
    expect(invalid).toMatchObject({ isError: true, structuredContent: { code: "invalid_input" } });
    expect(await callTool(authorization, "echo", { text: "missing" })).toMatchObject({
      isError: true,
      structuredContent: { code: "not_found", message: "Nothing found" },
    });
    expect(await callTool(authorization, "large_result")).toMatchObject({
      isError: true,
      structuredContent: { code: "result_too_large" },
    });
  });
});
