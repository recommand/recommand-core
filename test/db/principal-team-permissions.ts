import { beforeEach, expect, test } from "bun:test";
import type { ActorPrincipal } from "../../data/principal-permissions";
import { pool, useTestDatabase } from "./harness";

process.env.JWT_SECRET = "principal-team-permissions-test-only-signing-key";
const { findClient } = await import("../../data/oauth-clients");
const { createGrant } = await import("../../data/oauth-grants");
const { hasPrincipalPermission, listPrincipalTeamPermissionIds } = await import("../../data/principal-permissions");
const { getRegisteredPermissionsByScope, registerPermission } = await import("../../lib/permissions");

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "all", id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "never", id: "test.never", name: "Never", prerequisiteActorPermissionIds: [] });

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE users, teams, oauth_clients, principal_permissions CASCADE");
  await pool.query(`INSERT INTO users (id, email, password_hash, is_admin) VALUES
    ('member', 'member@example.com', 'unused', false),
    ('admin', 'admin@example.com', 'unused', true)`);
  await pool.query("INSERT INTO teams (id, name) VALUES ('one', 'One'), ('two', 'Two')");
  await pool.query("INSERT INTO team_members (team_id, user_id) VALUES ('one', 'member'), ('two', 'member'), ('one', 'admin')");
  await pool.query(`INSERT INTO user_permissions (user_id, team_id, permission_id) VALUES
    ('member', 'one', 'test.read'), ('member', 'one', 'test.never'), ('member', 'two', 'test.read')`);
  await pool.query(`INSERT INTO api_keys (id, name, user_id, team_id, type, secret_hash) VALUES
    ('member_key', 'Member', 'member', 'one', 'basic', 'unused'),
    ('admin_key', 'Admin', 'admin', 'one', 'basic', 'unused')`);
  await pool.query(`INSERT INTO principal_permissions (principal_type, principal_id, team_id, permission_id) VALUES
    ('api_key', 'member_key', 'one', 'test.read'), ('api_key', 'member_key', 'one', 'test.write'),
    ('api_key', 'admin_key', 'one', 'test.read'), ('api_key', 'admin_key', 'one', 'test.write')`);
  await pool.query(`INSERT INTO oauth_clients (id, kind, grant_types, redirect_uris, token_endpoint_auth_method) VALUES
    ('dcr_app', 'dynamic', '{authorization_code}', '{https://app.example.com/callback}', 'none')`);
});

// What `hasPrincipalPermission` decides for each team permission, one at a time
const heldOneByOne = async (principal: ActorPrincipal, teamId: string) => {
  const permissionIds = getRegisteredPermissionsByScope("team").map((permission) => permission.id);
  const held = await Promise.all(permissionIds.map((permissionId) => hasPrincipalPermission(principal, teamId, permissionId)));

  return permissionIds.filter((_, index) => held[index]).toSorted();
};

test("lists the team permissions a principal holds, as checking them one at a time does", async () => {
  const { grant } = await createGrant({
    client: (await findClient("dcr_app"))!,
    permissionIds: ["test.read"],
    teamIds: ["one", "two"],
    userId: "member",
  });
  // As if apps could get `test.never` when the user consented, and no longer can
  await pool.query(
    "INSERT INTO principal_permissions (principal_type, principal_id, team_id, permission_id) VALUES ('oauth_grant', $1, 'one', 'test.never')",
    [grant.id]
  );
  const principals: ActorPrincipal[] = [
    { type: "user", userId: "member" },
    { apiKeyId: "member_key", ownerIsAdmin: false, ownerUserId: "member", teamId: "one", type: "api_key" },
    { apiKeyId: "admin_key", ownerIsAdmin: true, ownerUserId: "admin", teamId: "one", type: "api_key" },
    { grantId: grant.id, type: "oauth_grant", userId: "member" },
  ];

  for (const principal of principals) {
    for (const teamId of ["one", "two"]) {
      expect((await listPrincipalTeamPermissionIds(principal, teamId)).toSorted()).toEqual(await heldOneByOne(principal, teamId));
    }
  }

  // A non-admin's key reaches no other team, and a grant never holds a permission apps can't get
  expect(await listPrincipalTeamPermissionIds(principals[1]!, "two")).toEqual([]);
  expect(await listPrincipalTeamPermissionIds(principals[3]!, "one")).toEqual(["test.read"]);
});
