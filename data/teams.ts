import { teamMembers, teams, userPermissions, users } from "@core/db/schema";
import { emitBackendEvent, CORE_BACKEND_EVENTS } from "@core/lib/backend-events";
import { getTeamCreationPermissions } from "@core/lib/permissions";
import { presignUrl, isTeamLogoEnabled } from "@core/lib/s3";
import { resolveSupportedLanguage, toSupportedLanguage } from "@core/lib/translations-server";
import { db } from "@recommand/db";
import { and, count, eq } from "drizzle-orm";

export type Team = typeof teams.$inferSelect;

/**
 * The language to write a team's notifications in.
 *
 * Notifications go to addresses configured on the team (support mailboxes,
 * company notification addresses, rule actions) rather than to a specific user,
 * so there is no recipient language to read. Teams set this on their settings
 * page; it starts out as the language of whoever created the team.
 */
export async function getTeamLanguage(teamId: string): Promise<string> {
  const [team] = await db
    .select({ language: teams.language })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  return team?.language ?? "en";
}

export async function getUserTeams(userId: string) {
  const matchingTeams = await db
    .select()
    .from(teams)
    .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId));
  return matchingTeams.map((team) => team.teams);
}

export async function getTeam(teamId: string) {
  const team = await db.select().from(teams).where(eq(teams.id, teamId));
  return team[0];
}

export async function createTeam(
  userId: string,
  team: typeof teams.$inferInsert
) {
  // A new team has no members yet and so no language of its own; the creator's
  // is the only signal available. They can change it in the team settings.
  let language = team.language;
  if (!language) {
    const [creator] = await db
      .select({ language: users.language })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    language = creator?.language;
  }
  language = await resolveSupportedLanguage(language);

  return await db.transaction(async (tx) => {
    const [newTeam] = await tx.insert(teams).values({ ...team, language }).returning();
    await tx.insert(teamMembers).values({
      userId,
      teamId: newTeam.id,
    });

    // Grant team creation permissions to the creator
    const creationPermissions = getTeamCreationPermissions();
    if (creationPermissions.length > 0) {
      await tx.insert(userPermissions).values(
        creationPermissions.map(permission => ({
          userId,
          teamId: newTeam.id,
          permissionId: permission.id,
          grantedByUserId: null, // System-granted on team creation
        }))
      );
    }

    await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_CREATED, {...newTeam, tx});
    await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_MEMBER_ADDED, { teamId: newTeam.id, userId, tx });
    return newTeam;
  });
}

export async function isMember(userId: string, teamId: string) {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)));
  return cnt > 0;
}

export async function updateTeam(
  teamId: string,
  updates: Partial<Pick<typeof teams.$inferInsert, 'name' | 'teamDescription' | 'logoUrl' | 'language'>>
) {
  if (updates.language !== undefined) {
    const language = await toSupportedLanguage(updates.language);
    if (!language) {
      throw new Error(`Unsupported language: ${updates.language}`);
    }
    updates = { ...updates, language };
  }

  const [updatedTeam] = await db
    .update(teams)
    .set(updates)
    .where(eq(teams.id, teamId))
    .returning();
  return updatedTeam;
}

export function resolveTeamLogoUrl(team: Team): Team & { logoUrl: string | null } {
  if (!team.logoUrl || !isTeamLogoEnabled()) return team;
  return {
    ...team,
    logoUrl: presignUrl(team.logoUrl, { expiresIn: 7 * 24 * 60 * 60 }), // 7 days
  };
}

export async function deleteTeam(teamId: string) {
  // Allow other packages to veto the deletion (e.g. when the team still owns
  // resources that need to be cleaned up first). A throwing listener aborts the
  // delete before any data is removed.
  await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_BEFORE_DELETE, { teamId });
  const deletedTeam = await db.delete(teams).where(eq(teams.id, teamId));
  await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_DELETED, { teamId });
  return deletedTeam;
}