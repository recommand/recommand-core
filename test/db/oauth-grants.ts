import { beforeEach, describe, expect, test } from "bun:test";
import { pool, useTestDatabase } from "./harness";

const { registerPermission } = await import("../../lib/permissions");
const { hasPrincipalPermission } = await import("../../data/principal-permissions");
const { createGrant, deleteGrant, findGrant, listGrantPermissionIds } = await import("../../data/oauth-grants");
const { findClient } = await import("../../data/oauth-clients");

registerPermission({ id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });
registerPermission({ id: "test.global", name: "Global", prerequisiteActorPermissionIds: [], scope: "global" });

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions CASCADE");
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('member', 'member@example.com', 'unused', false),
    ('admin', 'admin@example.com', 'unused', true)`);
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two'), ('three', 'Three')");
  await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES
    ('one', 'member'), ('two', 'member'), ('one', 'admin')`);
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'test.read'), ('member', 'one', 'test.write'), ('member', 'two', 'test.read'),
    ('admin', 'one', 'test.read')`);
  await pool.query(`INSERT INTO oauth_clients (id, kind, allowed_permissions, grant_types, redirect_uris, token_endpoint_auth_method) VALUES
    ('dcr_any', 'dynamic', NULL, '{authorization_code}', '{https://app.example.com/callback}', 'none'),
    ('dcr_read', 'dynamic', '{test.read}', '{authorization_code}', '{https://app.example.com/callback}', 'none')`);
});

const grantFor = async (userId: string, teamIds: string[], permissionIds: string[], clientId = "dcr_any") => {
  const client = (await findClient(clientId))!;
  return createGrant({ client, permissionIds, teamIds, userId });
};
const can = (grantId: string, userId: string, teamId: string, permissionId: string) =>
  hasPrincipalPermission({ grantId, type: "oauth_grant", userId }, teamId, permissionId);

describe("creating a grant", () => {
  test("grants the requested permissions the user holds in each picked team", async () => {
    const { grant, permissionIdsByTeam } = await grantFor("member", ["one", "two"], ["test.read", "test.write"]);
    const expected = new Map([
      ["one", ["test.read", "test.write"]],
      ["two", ["test.read"]],
    ]);
    expect(permissionIdsByTeam).toEqual(expected);
    expect(await listGrantPermissionIds(grant.id)).toEqual(expected);
  });

  test("refuses a team the user can't grant anything in", async () => {
    await expect(grantFor("member", ["one", "three"], ["test.read"])).rejects.toThrow("Nothing can be granted in these teams: three");
  });

  test("refuses global permissions, unknown ones, and ones the client may not get", async () => {
    await expect(grantFor("member", ["one"], ["test.global"])).rejects.toThrow("can't be granted");
    await expect(grantFor("member", ["one"], ["test.unknown"])).rejects.toThrow("can't be granted");
    await expect(grantFor("member", ["one"], ["test.read", "test.write"], "dcr_read")).rejects.toThrow("test.write");
  });

  test("gives an admin only what they hold as a member", async () => {
    await expect(grantFor("admin", ["two"], ["test.read"])).rejects.toThrow("Nothing can be granted");
    const { permissionIdsByTeam } = await grantFor("admin", ["one"], ["test.read", "test.write"]);
    expect(permissionIdsByTeam).toEqual(new Map([["one", ["test.read"]]]));
  });
});

describe("using a grant", () => {
  test("allows only granted permissions in granted teams", async () => {
    const { grant } = await grantFor("member", ["one"], ["test.read"]);
    expect(await can(grant.id, "member", "one", "test.read")).toBe(true);
    expect(await can(grant.id, "member", "one", "test.write")).toBe(false);
    expect(await can(grant.id, "member", "two", "test.read")).toBe(false);
  });

  test("follows the user's current permissions and membership", async () => {
    const { grant } = await grantFor("member", ["one", "two"], ["test.read", "test.write"]);
    await pool.query("DELETE FROM user_permissions WHERE user_id = 'member' AND team_id = 'one' AND permission_id = 'test.write'");
    await pool.query("DELETE FROM team_members WHERE user_id = 'member' AND team_id = 'two'");
    expect(await can(grant.id, "member", "one", "test.read")).toBe(true);
    expect(await can(grant.id, "member", "one", "test.write")).toBe(false);
    expect(await can(grant.id, "member", "two", "test.read")).toBe(false);
  });

  test("never lets an admin's grant through the admin bypass", async () => {
    const { grant } = await grantFor("admin", ["one"], ["test.read"]);
    await pool.query("DELETE FROM user_permissions WHERE user_id = 'admin'");
    expect(await can(grant.id, "admin", "one", "test.read")).toBe(false);
    expect(await can(grant.id, "admin", "two", "test.read")).toBe(false);
  });

  test("stops working once deleted", async () => {
    const { grant } = await grantFor("member", ["one"], ["test.read"]);
    expect(await deleteGrant(grant.id)).toBe(true);
    expect(await deleteGrant(grant.id)).toBe(false);
    expect(await findGrant(grant.id)).toBeNull();
    expect(await can(grant.id, "member", "one", "test.read")).toBe(false);
    expect(await listGrantPermissionIds(grant.id)).toEqual(new Map());
  });
});
