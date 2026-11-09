import { listMemberTeamPermissionIds } from "@core/data/permissions";
import { oauthClients, oauthGrants, principalPermissions, teamMembers, teams } from "@core/db/schema";
import { getDelegablePermission } from "@core/lib/permissions";
import { db } from "@recommand/db";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, notExists } from "drizzle-orm";
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

// How stale a grant's `lastUsedAt` may get, so most requests don't write it
const LAST_USED_INTERVAL_MS = 10 * 60 * 1_000;

/**
 * Records a user's consent for a client: the requested permissions in each team
 * the user picked. Per team, the grant gets the permissions the user holds there
 * as a member, so an admin's consent carries no admin access. A permission that
 * isn't delegable or that the client may not be granted, or a team the user
 * can't grant anything in, is refused rather than left out.
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
      !getDelegablePermission(permissionId) ||
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

export type ConnectedApp = {
  client: OAuthClient;
  connectedAt: Date;
  lastUsedAt: Date | null;
  teams: { id: string; name: string; permissionIds: string[] }[];
};

/**
 * The apps a user connected, most recently connected first. Connecting an app
 * again makes another grant; its grants show as one app, holding what they hold
 * together, connected when the first was made and last used when any was.
 */
export const listConnectedApps = async (userId: string): Promise<ConnectedApp[]> => {
  const grants = await db
    .select({ client: oauthClients, createdAt: oauthGrants.createdAt, id: oauthGrants.id, lastUsedAt: oauthGrants.lastUsedAt })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(eq(oauthGrants.userId, userId))
    .orderBy(desc(oauthGrants.createdAt));
  if (grants.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      grantId: principalPermissions.principalId,
      permissionId: principalPermissions.permissionId,
      teamId: teams.id,
      teamName: teams.name,
    })
    .from(principalPermissions)
    .innerJoin(teams, eq(teams.id, principalPermissions.teamId))
    .where(
      and(
        eq(principalPermissions.principalType, "oauth_grant"),
        inArray(principalPermissions.principalId, grants.map((grant) => grant.id))
      )
    )
    .orderBy(teams.name, principalPermissions.permissionId);

  return [...Map.groupBy(grants, (grant) => grant.client.id).values()].map((clientGrants) => {
    const grantIds = new Set(clientGrants.map((grant) => grant.id));
    const clientRows = rows.filter((row) => grantIds.has(row.grantId));
    return {
      client: clientGrants[0].client,
      connectedAt: clientGrants.at(-1)!.createdAt,
      lastUsedAt: clientGrants.flatMap((grant) => grant.lastUsedAt ?? []).toSorted((a, b) => b.getTime() - a.getTime())[0] ?? null,
      teams: [...Map.groupBy(clientRows, (row) => row.teamId)].map(([teamId, teamRows]) => ({
        id: teamId,
        name: teamRows[0].teamName,
        permissionIds: [...new Set(teamRows.map((row) => row.permissionId))],
      })),
    };
  });
};

export const recordGrantUse = async (grant: OAuthGrant): Promise<void> => {
  if (grant.lastUsedAt && Date.now() - grant.lastUsedAt.getTime() < LAST_USED_INTERVAL_MS) {
    return;
  }
  await db.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, grant.id));
};

// Deletes the grants and their permissions, which have no foreign key to the
// grant; their tokens and codes go with them. Returns the deleted grants' IDs.
const deleteGrantsWhere = async (condition: SQL): Promise<string[]> => db.transaction(async (tx) => {
  const grantIds = (await tx.select({ id: oauthGrants.id }).from(oauthGrants).where(condition)).map(({ id }) => id);
  if (grantIds.length === 0) {
    return [];
  }
  await tx
    .delete(principalPermissions)
    .where(and(eq(principalPermissions.principalType, "oauth_grant"), inArray(principalPermissions.principalId, grantIds)));
  await tx.delete(oauthGrants).where(inArray(oauthGrants.id, grantIds));
  return grantIds;
});

/** Deletes a grant, so its tokens stop working. Returns `false` when there was no such grant. */
export const deleteGrant = async (grantId: string): Promise<boolean> =>
  (await deleteGrantsWhere(eq(oauthGrants.id, grantId))).length > 0;

/**
 * Disconnects one of the user's apps: every grant they gave it is deleted.
 * Returns the deleted grants' IDs, none when the user hasn't connected the app.
 */
export const disconnectApp = async (userId: string, clientId: string): Promise<string[]> =>
  deleteGrantsWhere(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId))!);

export type GrantWriter = Pick<typeof db, "delete" | "select">;

/**
 * Removes a team from grants: from one user's grants when they leave the team,
 * or from every grant when the team is deleted. Joining the team again doesn't
 * bring it back, and a grant left without teams is deleted.
 */
export const removeTeamFromGrants = async (
  teamId: string,
  { executor = db, userId }: { executor?: GrantWriter; userId?: string } = {}
): Promise<void> => {
  const removed = await executor
    .delete(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, "oauth_grant"),
        eq(principalPermissions.teamId, teamId),
        userId
          ? inArray(
              principalPermissions.principalId,
              executor.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.userId, userId))
            )
          : undefined
      )
    )
    .returning({ grantId: principalPermissions.principalId });
  const grantIds = [...new Set(removed.map(({ grantId }) => grantId))];
  if (grantIds.length === 0) {
    return;
  }

  await executor
    .delete(oauthGrants)
    .where(
      and(
        inArray(oauthGrants.id, grantIds),
        notExists(
          executor
            .select({ permissionId: principalPermissions.permissionId })
            .from(principalPermissions)
            .where(
              and(
                eq(principalPermissions.principalType, "oauth_grant"),
                eq(principalPermissions.principalId, oauthGrants.id)
              )
            )
        )
      )
    );
};
