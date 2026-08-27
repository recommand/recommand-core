import { teamMembers, users } from "@core/db/schema";
import { emitBackendEvent, CORE_BACKEND_EVENTS } from "@core/lib/backend-events";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";

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
  const res = await db
    .insert(teamMembers)
    .values({ teamId, userId })
    .returning();
  await emitBackendEvent(CORE_BACKEND_EVENTS.TEAM_MEMBER_ADDED, { teamId, userId });
  return res;
}

export async function removeTeamMember(teamId: string, userId: string) {
  const res = await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
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