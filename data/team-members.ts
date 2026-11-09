import { removeTeamFromGrants } from "@core/data/oauth-grants";
import { apiKeys, principalPermissions, teamMembers, userPermissions, users } from "@core/db/schema";
import { emitBackendEvent, CORE_BACKEND_EVENTS } from "@core/lib/backend-events";
import { getTeamJoinPermissions } from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";

export type MinimalTeamMember = typeof teamMembers.$inferSelect & {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    isAdmin: boolean;
    language: string;
    createdAt: Date;
    updatedAt: Date;
  }
};

export async function getMinimalTeamMembers(teamId: string): Promise<MinimalTeamMember[]> {
  return await db
    .select({
      teamId: teamMembers.teamId,
      userId: teamMembers.userId,
      createdAt: teamMembers.createdAt,
      updatedAt: teamMembers.updatedAt,
      user: {
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        isAdmin: users.isAdmin,
        language: users.language,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      },
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
}

export async function addTeamMember(teamId: string, userId: string) {
  const res = await db.transaction(async (tx) => {
    const members = await tx
      .insert(teamMembers)
      .values({ teamId, userId })
      .returning();
    const joinPermissions = getTeamJoinPermissions();
    if (joinPermissions.length > 0) {
      await tx
        .insert(userPermissions)
        .values(joinPermissions.map((permission) => ({ permissionId: permission.id, teamId, userId })))
        .onConflictDoNothing();
    }
    return members;
  });
  await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_MEMBER_ADDED, { teamId, userId });
  return res;
}

export async function removeTeamMember(teamId: string, userId: string) {
  const res = await db.transaction(async (tx) => {
    // Locked first, so an OAuth grant being made for this member either finishes
    // before the team is taken out of it, or finds the member gone
    await tx
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .for("update");
    const memberKeys = and(eq(apiKeys.teamId, teamId), eq(apiKeys.userId, userId));
    // Grants name their key without a foreign key, so they go first
    await tx.delete(principalPermissions)
      .where(and(
        eq(principalPermissions.principalType, "api_key"),
        inArray(principalPermissions.principalId, tx.select({ id: apiKeys.id }).from(apiKeys).where(memberKeys)),
      ));
    await tx.delete(apiKeys).where(memberKeys);
    await tx.delete(userPermissions)
      .where(and(eq(userPermissions.teamId, teamId), eq(userPermissions.userId, userId)));
    await removeTeamFromGrants(teamId, { executor: tx, userId });
    return tx.delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  });
  await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_MEMBER_REMOVED, { teamId, userId });
  return res;
}

export async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const result = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  
  return result.length > 0;
}

export async function getUserByEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}
