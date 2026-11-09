import { beforeEach, describe, expect, test } from "bun:test";
import { pool, useTestDatabase } from "./harness";

// Resetting a password goes through `api/auth`, which needs a signing key for sessions
process.env.JWT_SECRET = "oauth-grants-test-only-signing-key";
const { registerPermission } = await import("../../lib/permissions");
const { createGrant, deleteGrant, findGrant, listGrantPermissionIds } = await import("../../data/oauth-grants");
const { findClient } = await import("../../data/oauth-clients");
const { addTeamMember, removeTeamMember } = await import("../../data/team-members");
const { deleteTeam } = await import("../../data/teams");
const { default: auth } = await import("../../api/auth");

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "all", id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "opt_in", id: "test.optional", name: "Optional", prerequisiteActorPermissionIds: [] });
registerPermission({ id: "test.undelegated", name: "Undelegated", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "all", id: "test.global", name: "Global", prerequisiteActorPermissionIds: [], scope: "global" });

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

  test("grants an opt-in permission like any other, once the user chose it", async () => {
    await pool.query("INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES ('member', 'two', 'test.optional')");
    const { grant, permissionIdsByTeam } = await grantFor("member", ["two"], ["test.optional"]);
    expect(permissionIdsByTeam).toEqual(new Map([["two", ["test.optional"]]]));
    expect(await listGrantPermissionIds(grant.id)).toEqual(new Map([["two", ["test.optional"]]]));
  });

  test("refuses a team the user can't grant anything in", async () => {
    await expect(grantFor("member", ["one", "three"], ["test.read"])).rejects.toThrow("Nothing can be granted in these teams: three");
  });

  test("refuses global, undelegated and unknown permissions, and ones the client may not get", async () => {
    await pool.query("INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES ('member', 'one', 'test.undelegated')");
    await expect(grantFor("member", ["one"], ["test.global"])).rejects.toThrow("can't be granted");
    await expect(grantFor("member", ["one"], ["test.undelegated"])).rejects.toThrow("can't be granted");
    await expect(grantFor("member", ["one"], ["test.unknown"])).rejects.toThrow("can't be granted");
    await expect(grantFor("member", ["one"], ["test.read", "test.write"], "dcr_read")).rejects.toThrow("test.write");
  });

  test("gives an admin only what they hold as a member", async () => {
    await expect(grantFor("admin", ["two"], ["test.read"])).rejects.toThrow("Nothing can be granted");
    const { permissionIdsByTeam } = await grantFor("admin", ["one"], ["test.read", "test.write"]);
    expect(permissionIdsByTeam).toEqual(new Map([["one", ["test.read"]]]));
  });
});

test("deleting a grant deletes its permissions", async () => {
  const { grant } = await grantFor("member", ["one"], ["test.read"]);
  expect(await deleteGrant(grant.id)).toBe(true);
  expect(await deleteGrant(grant.id)).toBe(false);
  expect(await findGrant(grant.id)).toBeNull();
  expect(await listGrantPermissionIds(grant.id)).toEqual(new Map());
});

describe("leaving or deleting a team", () => {
  test("removes the team from the leaving user's grants for good", async () => {
    const { grant } = await grantFor("member", ["one", "two"], ["test.read"]);
    await removeTeamMember("two", "member");
    await addTeamMember("two", "member");
    await pool.query("INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES ('member', 'two', 'test.read')");
    expect(await listGrantPermissionIds(grant.id)).toEqual(new Map([["one", ["test.read"]]]));
  });

  test("leaves other members' grants for the team alone", async () => {
    const { grant } = await grantFor("admin", ["one"], ["test.read"]);
    await removeTeamMember("one", "member");
    expect(await listGrantPermissionIds(grant.id)).toEqual(new Map([["one", ["test.read"]]]));
  });

  test("deletes a grant once its last team is gone", async () => {
    const { grant: left } = await grantFor("member", ["two"], ["test.read"]);
    const { grant: deleted } = await grantFor("admin", ["one"], ["test.read"]);
    const { grant: both } = await grantFor("member", ["one", "two"], ["test.read"]);
    await removeTeamMember("two", "member");
    await deleteTeam("one");
    expect(await findGrant(left.id)).toBeNull();
    expect(await findGrant(deleted.id)).toBeNull();
    expect(await findGrant(both.id)).toBeNull();
  });

  test("keeps a grant that still has a team", async () => {
    const { grant } = await grantFor("member", ["one", "two"], ["test.read"]);
    await deleteTeam("one");
    expect(await findGrant(grant.id)).not.toBeNull();
    expect(await listGrantPermissionIds(grant.id)).toEqual(new Map([["two", ["test.read"]]]));
  });
});

test("resetting the password ends every app's access, and only the user's", async () => {
  const { grant: own } = await grantFor("member", ["one"], ["test.read"]);
  const { grant: kept } = await grantFor("admin", ["one"], ["test.read"]);
  await pool.query("UPDATE users SET reset_token = 'reset', reset_token_expires = now() + interval '1 hour' WHERE id = 'member'");
  const response = await auth.request("/auth/reset-password", {
    body: JSON.stringify({ password: "a new password", token: "reset" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.status).toBe(200);
  expect(await findGrant(own.id)).toBeNull();
  expect(await findGrant(kept.id)).not.toBeNull();
});
