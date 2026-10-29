import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { Hono } from "hono";
import bcrypt from "bcrypt";
import type { AuthenticatedUserContext } from "../../lib/auth-middleware";

const databaseUrl = process.env.CORE_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("CORE_TEST_DATABASE_URL is required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Use a disposable localhost database ending in _test");
}
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = "api-key-grants-test-only-signing-key";
const pool = new Pool({ connectionString: databaseUrl });
const { db } = await import("@recommand/db");
const { default: apiKeys } = await import("../../api/api-keys");
const { createSession } = await import("../../lib/session");
const { sign } = await import("../../lib/jwt");
const { requireTeamAccess } = await import("../../lib/auth-middleware");
const { requirePermission } = await import("../../lib/permissions/permission-middleware");
const { registerPermission } = await import("../../lib/permissions");
const { getApiKeyPermissionIds, setApiKeyPermissions } = await import("../../data/api-keys");
const { hasPrincipalPermission } = await import("../../data/principal-permissions");
const { registerServicePrincipal } = await import("../../data/service-principals");
const { createInstallation } = await import("../../data/installations");

const migration = fileURLToPath(new URL("../../db/drizzle/20261029135810_nebulous_iron_monger.sql", import.meta.url));
const app = new Hono<AuthenticatedUserContext>();
app.get("/login/:userId", async (c) => {
  await createSession(c, { id: c.req.param("userId"), isAdmin: false });
  return c.json({ ok: true });
});
app.get("/:teamId/read", requireTeamAccess(), requirePermission("test.read"), (c) => c.json({ ok: true }));
app.get("/:teamId/manage", requireTeamAccess(), requirePermission("core.team.manage"), (c) => c.json({ ok: true }));
app.route("/", apiKeys);

async function seed() {
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('owner', 'owner@example.com', 'unused', false),
    ('other', 'other@example.com', 'unused', false),
    ('admin', 'admin@example.com', 'unused', true)`);
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two')");
  await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES
    ('one', 'owner'), ('two', 'owner'), ('one', 'other')`);
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('owner', 'one', 'core.team.manage'), ('owner', 'one', 'test.read'),
    ('owner', 'one', 'test.write'), ('owner', 'two', 'test.other')`);
}
async function cookie(userId = "owner") {
  const response = await app.request(`/login/${userId}`);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}
async function create(type: "basic" | "jwt", permissionIds?: string[], headers?: Record<string, string>, teamId = "one") {
  const response = await app.request(`/${teamId}/api-keys`, {
    method: "POST",
    headers: { ...(headers ?? await cookie()), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test key", type, expiresInSeconds: 3600, permissionIds }),
  });
  return { response, body: await response.json() as any };
}
function credentials(key: any): Record<string, string> {
  return key.type === "basic"
    ? { Authorization: `Basic ${btoa(`${key.id}:${key.secret}`)}` }
    : { Authorization: `Bearer ${key.jwt}` };
}
async function update(keyId: string, permissionIds: string[], headers?: Record<string, string>, teamId = "one") {
  return app.request(`/${teamId}/api-keys/${keyId}/permissions`, {
    method: "PUT",
    headers: { ...(headers ?? await cookie()), "Content-Type": "application/json" },
    body: JSON.stringify({ permissionIds }),
  });
}
async function read(headers: Record<string, string>, teamId = "one") {
  return (await app.request(`/${teamId}/read`, { headers })).status;
}

beforeAll(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for (const name of ["framework", "core"]) {
    const directory = new URL(`../../../${name}/db/drizzle/`, import.meta.url);
    for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
      await pool.query(await readFile(new URL(file, directory), "utf8"));
    }
  }
});
afterAll(async () => {
  await pool.end();
  await db.$client.end();
});

describe("grant migration", () => {
  test("fresh installation creates an empty grant table", async () => {
    expect((await pool.query("SELECT * FROM principal_permissions")).rows).toEqual([]);
  });
  test("existing keys inherit team-local grants and admins retain team management", async () => {
    await pool.query("DROP TABLE principal_permissions; DROP TYPE principal_types");
    await seed();
    const expiresAt = new Date(Date.now() + 3600_000);
    const jwt = await sign({ sub: "owner", jti: "legacy_jwt", teamId: "one" }, expiresAt);
    await pool.query(`INSERT INTO api_keys (id, name, user_id, team_id, type, secret_hash, expires_at) VALUES
      ('legacy_basic', 'Legacy basic', 'owner', 'one', 'basic', $1, NULL),
      ('legacy_jwt', 'Legacy JWT', 'owner', 'one', 'jwt', '', $2),
      ('legacy_admin', 'Legacy admin', 'admin', 'one', 'basic', 'unused', NULL)`,
      [await bcrypt.hash("legacy-secret", 4), expiresAt]);
    await pool.query(await readFile(migration, "utf8"));
    for (const id of ["legacy_basic", "legacy_jwt"]) {
      expect((await getApiKeyPermissionIds(id, "one")).sort()).toEqual(["core.team.manage", "test.read", "test.write"]);
      expect(await getApiKeyPermissionIds(id, "two")).toEqual([]);
    }
    expect(await read({ Authorization: `Basic ${btoa("legacy_basic:legacy-secret")}` })).toBe(200);
    expect(await read({ Authorization: `Bearer ${jwt}` })).toBe(200);
    expect(await getApiKeyPermissionIds("legacy_admin", "one")).toEqual(["core.team.manage"]);
    expect(await hasPrincipalPermission({ type: "api_key", apiKeyId: "legacy_admin", ownerUserId: "admin" }, "one", "core.team.manage")).toBe(true);
  });
  for (const direction of ["platform-first", "extraction-first"] as const) {
    test(`${direction}: overlapping migrations preserve grants and revocations`, async () => {
      await pool.query("TRUNCATE users, teams, principal_permissions CASCADE");
      await pool.query("DROP TABLE principal_permissions; DROP TYPE principal_types");
      await seed();
      await pool.query(`INSERT INTO api_keys (id, name, user_id, team_id, type, secret_hash)
        VALUES ('existing_key', 'Existing key', 'owner', 'one', 'basic', 'unused')`);
      const platformMigration = fileURLToPath(new URL("../../db/drizzle/20260829221148_amazing_salo.sql", import.meta.url));
      const files = direction === "platform-first" ? [platformMigration, migration] : [migration, platformMigration];
      await pool.query(await readFile(files[0]!, "utf8"));
      expect((await getApiKeyPermissionIds("existing_key", "one")).sort()).toEqual(["core.team.manage", "test.read", "test.write"]);
      await pool.query("DELETE FROM principal_permissions WHERE permission_id = 'test.read'");
      await pool.query(await readFile(files[1]!, "utf8"));
      expect((await getApiKeyPermissionIds("existing_key", "one")).sort()).toEqual(["core.team.manage", "test.write"]);
      await pool.query("DELETE FROM principal_permissions");
      for (const file of files) await pool.query(await readFile(file, "utf8"));
      expect(await getApiKeyPermissionIds("existing_key", "one")).toEqual([]);
    });
  }
});

for (const id of ["test.read", "test.write", "test.other"]) {
  registerPermission({ id, name: id, scope: "team", prerequisiteActorPermissionIds: ["core.team.manage"], hasAdminPrerequisite: false });
}
registerPermission({ id: "test.global", name: "Global", scope: "global", prerequisiteActorPermissionIds: [], hasAdminPrerequisite: true });

describe("API-key grants", () => {
  beforeEach(async () => {
    await pool.query("TRUNCATE users, teams, principal_permissions CASCADE");
    await seed();
  });
  for (const type of ["basic", "jwt"] as const) {
    test(`${type}: requires both a key grant and the owner's current permission`, async () => {
      const { response, body } = await create(type, ["test.read"]);
      expect(response.status).toBe(200);
      const headers = credentials(body.apiKey);
      expect(await read(headers)).toBe(200);
      expect((await app.request("/one/manage", { headers })).status).toBe(401);
      await pool.query("DELETE FROM user_permissions WHERE user_id = 'owner' AND team_id = 'one' AND permission_id = 'test.read'");
      expect(await read(headers)).toBe(401);
      expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual(["test.read"]);
    });
    test(`${type}: empty grants deny permissions and updates take effect immediately`, async () => {
      const { body } = await create(type, []);
      const headers = credentials(body.apiKey);
      expect(await read(headers)).toBe(401);
      expect((await update(body.apiKey.id, ["test.read", "test.read"])).status).toBe(200);
      expect(await read(headers)).toBe(200);
      expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual(["test.read"]);
      expect((await update(body.apiKey.id, [])).status).toBe(200);
      expect(await read(headers)).toBe(401);
    });
    test(`${type}: grants are isolated by team`, async () => {
      const { body } = await create(type, ["test.read"]);
      expect(await read(credentials(body.apiKey), "two")).toBe(401);
      expect((await update(body.apiKey.id, [], undefined, "two")).status).toBe(404);
      expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual(["test.read"]);
    });
    test(`${type}: missing owner membership and deleted keys deny access`, async () => {
      const { body } = await create(type, ["test.read"]);
      const headers = credentials(body.apiKey);
      await pool.query("DELETE FROM team_members WHERE user_id = 'owner' AND team_id = 'one'");
      expect(await read(headers)).toBe(401);
      await pool.query("INSERT INTO team_members (user_id, team_id) VALUES ('owner', 'one')");
      expect(await read(headers)).toBe(200);
      await pool.query("DELETE FROM api_keys WHERE id = $1", [body.apiKey.id]);
      expect(await read(headers)).toBe(401);
    });
    test(`${type}: restricted callers cannot elevate themselves or create a stronger key`, async () => {
      const { body } = await create(type, ["test.read"]);
      const headers = credentials(body.apiKey);
      expect((await update(body.apiKey.id, ["test.read", "core.team.manage"], headers)).status).toBe(403);
      const attempted = await create(type, ["core.team.manage"], headers);
      expect(attempted.response.status).toBe(403);
      expect((await pool.query("SELECT id FROM api_keys")).rows).toHaveLength(1);
      const inherited = await create(type, undefined, headers);
      expect(inherited.response.status).toBe(200);
      expect(inherited.body.apiKey.permissionIds).toEqual(["test.read"]);
    });
    test(`${type}: omitted grants default to the owner's permissions`, async () => {
      const { response, body } = await create(type);
      expect(response.status).toBe(200);
      expect(body.apiKey.permissionIds.sort()).toEqual(["core.team.manage", "test.read", "test.write"]);
    });
    test(`${type}: invalid and global grants do not leave an orphaned key`, async () => {
      for (const id of ["unknown", "test.global"]) {
        expect((await create(type, [id])).response.status).toBe(400);
      }
      expect((await pool.query("SELECT id FROM api_keys")).rows).toEqual([]);
      expect((await pool.query("SELECT * FROM principal_permissions")).rows).toEqual([]);
    });
    test(`${type}: an admin-owned key still needs an explicit grant`, async () => {
      const { body } = await create(type, [], await cookie("admin"));
      const headers = credentials(body.apiKey);
      expect(await read(headers)).toBe(401);
      expect((await update(body.apiKey.id, ["test.read"], await cookie("admin"))).status).toBe(200);
      expect(await read(headers)).toBe(200);
    });
  }
  test("local service authentication retains cross-team permission access", async () => {
    const token = await registerServicePrincipal("api-key-merge-test");
    const headers = { Authorization: `Bearer ${token}` };
    expect(await read(headers)).toBe(200);
    expect(await read(headers, "two")).toBe(200);
  });
  test("installation authentication retains team-local explicit grants", async () => {
    const created = await createInstallation({ teamId: "one", name: "Merge test", expiresInSeconds: 3600, actorUserId: "owner", permissionIds: ["test.read"] });
    const headers = { Authorization: `Bearer ${created.token.jwt}` };
    expect(await read(headers)).toBe(200);
    expect(await read(headers, "two")).toBe(401);
    expect((await app.request("/one/manage", { headers })).status).toBe(401);
  });
  test("the actor cannot grant permissions the owner lacks", async () => {
    const { body } = await create("basic", []);
    await pool.query("DELETE FROM user_permissions WHERE user_id = 'owner' AND team_id = 'one' AND permission_id = 'test.write'");
    expect((await update(body.apiKey.id, ["test.write"], await cookie("admin"))).status).toBe(403);
  });
  test("the actor must be allowed to grant permissions", async () => {
    const { body } = await create("basic", []);
    expect((await update(body.apiKey.id, ["test.read"], await cookie("other"))).status).toBe(403);
  });
  test("an ordinary member cannot clear another owner's key grants", async () => {
    const { body } = await create("basic", ["test.read"]);
    expect((await update(body.apiKey.id, [], await cookie("other"))).status).toBe(403);
    expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual(["test.read"]);
  });
  for (const type of ["basic", "jwt"] as const) {
    test(`${type}: a restricted team manager key cannot clear another owner's grants`, async () => {
      const { body: target } = await create(type, ["test.read"]);
      await pool.query("INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES ('other', 'one', 'core.team.manage')");
      const { body: caller } = await create(type, [], await cookie("other"));
      expect((await update(target.apiKey.id, [], credentials(caller.apiKey))).status).toBe(403);
      expect(await getApiKeyPermissionIds(target.apiKey.id, "one")).toEqual(["test.read"]);
      expect((await update(target.apiKey.id, [], await cookie("other"))).status).toBe(200);
    });
    test(`${type}: a restricted admin key cannot clear another owner's grants`, async () => {
      const { body: target } = await create(type, ["test.read"]);
      const { body: caller } = await create(type, [], await cookie("admin"));
      expect((await update(target.apiKey.id, [], credentials(caller.apiKey))).status).toBe(403);
      expect(await getApiKeyPermissionIds(target.apiKey.id, "one")).toEqual(["test.read"]);
      expect((await update(target.apiKey.id, [], await cookie("admin"))).status).toBe(200);
    });
    test(`${type}: a team manager key with an explicit grant can clear another owner's grants`, async () => {
      const { body: target } = await create(type, ["test.read"]);
      await pool.query("INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES ('other', 'one', 'core.team.manage')");
      const { body: caller } = await create(type, ["core.team.manage"], await cookie("other"));
      expect((await update(target.apiKey.id, [], credentials(caller.apiKey))).status).toBe(200);
      expect(await getApiKeyPermissionIds(target.apiKey.id, "one")).toEqual([]);
    });
    test(`${type}: an owner can revoke their own key's grants using that key`, async () => {
      const { body } = await create(type, ["test.read"]);
      expect((await update(body.apiKey.id, [], credentials(body.apiKey))).status).toBe(200);
      expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual([]);
    });
  }
  test("invalid updates leave existing grants intact", async () => {
    const { body } = await create("basic", ["test.read"]);
    expect((await update(body.apiKey.id, ["test.global"])).status).toBe(400);
    expect((await update(body.apiKey.id, ["unknown"])).status).toBe(400);
    expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual(["test.read"]);
  });
  test("failed grant insertion rolls back the key and grant deletion", async () => {
    const { body } = await create("basic", ["test.read"]);
    await pool.query(`CREATE FUNCTION reject_test_grants() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected grant failure'; END $$;
      CREATE TRIGGER reject_test_grants BEFORE INSERT ON principal_permissions FOR EACH ROW EXECUTE FUNCTION reject_test_grants()`);
    try {
      await expect(setApiKeyPermissions({ apiKeyId: body.apiKey.id, teamId: "one", actorUserId: "owner", permissionIds: ["test.write"] })).rejects.toThrow();
      expect(await getApiKeyPermissionIds(body.apiKey.id, "one")).toEqual(["test.read"]);
      expect((await create("basic", ["test.read"])).response.status).toBe(500);
      expect((await pool.query("SELECT id FROM api_keys")).rows).toHaveLength(1);
    } finally {
      await pool.query("DROP TRIGGER reject_test_grants ON principal_permissions; DROP FUNCTION reject_test_grants()");
    }
  });
  test("listing keys includes their grants and preserves browser authorization", async () => {
    const { body } = await create("basic", ["test.read"]);
    const headers = await cookie();
    expect(await read(headers)).toBe(200);
    const response = await app.request("/one/api-keys", { headers });
    const json = await response.json() as any;
    expect(json.apiKeys.map((key: any) => [key.id, key.permissionIds])).toEqual([[body.apiKey.id, ["test.read"]]]);
  });
});
