import { listMemberTeamPermissionIds } from "@core/data/permissions";
import { oauthGrants, principalPermissions, teamMembers } from "@core/db/schema";
import { getRegisteredPermission } from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";
import type { OAuthClient } from "./oauth-clients";

export type OAuthGrant = typeof oauthGrants.$inferSelect;

export class OAuthGrantError extends Error {}

// Removing a member locks their membership first, so a grant made meanwhile either
// waits and then finds the team gone, or is made first and has the team removed
const lockMemberships = (executor: Pick<typeof db, "select">, userId: string, teamIds: string[]) =>
  executor
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, teamIds)))
    .for("share");

/**
 * Records a user's consent for a client: the requested permissions in each team
 * the user picked. Per team, the grant gets the permissions the user holds there
 * as a member, so an admin's consent carries no admin access. A permission the
 * client may not be granted, or a team the user can't grant anything in, is
 * refused rather than left out.
 */
export const createGrant = async (input: {
  client: OAuthClient;
  permissionIds: string[];
  teamIds: string[];
  userId: string;
}): Promise<{ grant: OAuthGrant; permissionIdsByTeam: Map<string, string[]> }> => {
  const permissionIds = [...new Set(input.permissionIds)];
  const teamIds = [...new Set(input.teamIds)];
  if (permissionIds.length === 0 || teamIds.length === 0) {
    throw new OAuthGrantError("A grant needs at least one team and one permission");
  }

  const refused = permissionIds.filter(
    (permissionId) =>
      getRegisteredPermission(permissionId)?.scope !== "team" ||
      (input.client.allowedPermissions !== null && !input.client.allowedPermissions.includes(permissionId))
  );
  if (refused.length > 0) {
    throw new OAuthGrantError(`These permissions can't be granted to this client: ${refused.join(", ")}`);
  }

  return db.transaction(async (tx) => {
    await lockMemberships(tx, input.userId, teamIds);
    const permissionIdsByTeam = new Map(
      await Promise.all(
        teamIds.map(async (teamId): Promise<[string, string[]]> => {
          // Empty for a team the user isn't a member of
          const held = new Set(await listMemberTeamPermissionIds(input.userId, teamId));
          return [teamId, permissionIds.filter((permissionId) => held.has(permissionId))];
        })
      )
    );
    const emptyTeamIds = [...permissionIdsByTeam].filter(([, granted]) => granted.length === 0).map(([teamId]) => teamId);
    if (emptyTeamIds.length > 0) {
      throw new OAuthGrantError(`Nothing can be granted in these teams: ${emptyTeamIds.join(", ")}`);
    }

    const [grant] = await tx
      .insert(oauthGrants)
      .values({
        clientId: input.client.id,
        principalType: "user",
        userId: input.userId,
      })
      .returning();
    await tx.insert(principalPermissions).values(
      [...permissionIdsByTeam].flatMap(([teamId, granted]) =>
        granted.map((permissionId) => ({
          grantedByUserId: input.userId,
          permissionId,
          principalId: grant.id,
          principalType: "oauth_grant" as const,
          teamId,
        }))
      )
    );
    return { grant, permissionIdsByTeam };
  });
};

export const findGrant = async (grantId: string): Promise<OAuthGrant | null> => {
  const [grant] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, grantId)).limit(1);
  return grant ?? null;
};

export const listGrantPermissionIds = async (grantId: string): Promise<Map<string, string[]>> => {
  const rows = await db
    .select({ permissionId: principalPermissions.permissionId, teamId: principalPermissions.teamId })
    .from(principalPermissions)
    .where(and(eq(principalPermissions.principalType, "oauth_grant"), eq(principalPermissions.principalId, grantId)));

  return new Map(
    [...Map.groupBy(rows, (row) => row.teamId)].map(([teamId, teamRows]) => [teamId, teamRows.map((row) => row.permissionId)])
  );
};

/**
 * Deletes a grant and its permissions, which have no foreign key to the grant.
 * Returns `false` when there was no such grant.
 */
export const deleteGrant = async (grantId: string): Promise<boolean> => db.transaction(async (tx) => {
  await tx
    .delete(principalPermissions)
    .where(and(eq(principalPermissions.principalType, "oauth_grant"), eq(principalPermissions.principalId, grantId)));
  const deleted = await tx.delete(oauthGrants).where(eq(oauthGrants.id, grantId)).returning({ id: oauthGrants.id });
  return deleted.length > 0;
});
