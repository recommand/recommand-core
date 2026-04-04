import { db } from "@recommand/db";
import bcrypt from "bcrypt";
import { verifySession } from "../lib/session";
import { users } from "../db/schema";
import { eq, getTableColumns } from "drizzle-orm";
import type { Context } from "@recommand/lib/api";
import { teamMembers, teams } from "@core/db/schema";
import { randomBytes } from "crypto";

export type UserWithoutPassword = Omit<typeof users.$inferSelect, "passwordHash" | "resetToken" | "resetTokenExpires" | "emailVerificationToken" | "emailVerificationExpires">;

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

export const getUsers = async (): Promise<UserWithoutPassword[]> => {
  return await db.select({
    id: users.id,
    email: users.email,
    isAdmin: users.isAdmin,
    emailVerified: users.emailVerified,
    language: users.language,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users);
};

export const getCurrentUser = async (c: Context) => {
  // Verify user's session
  const session = await verifySession(c);
  // Fetch user data
  if (!session?.userId) {
    return null;
  }
  const userId = session.userId;
  const { passwordHash: password, ...rest } = getTableColumns(users); // exclude "password" column
  
  const data = await db
    .select({
      ...rest,
      teams: teams,
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(users.id, userId));

  if (data.length === 0) {
    return null;
  }

  // Transform the data to group teams under the user
  const user = data[0];
  const userTeams = data.map(row => row.teams).filter(Boolean);

  // If user is admin, fetch all teams and mark membership
  if (user.isAdmin) {
    const allTeams = await db.select().from(teams);
    const userTeamIds = new Set(userTeams.map(t => t!.id));

    const teamsWithMembership = allTeams.map(team => ({
      ...team,
      isMember: userTeamIds.has(team.id),
    }));

    return {
      ...user,
      teams: teamsWithMembership,
    } as UserWithoutPassword & { teams: (typeof teams.$inferSelect & { isMember: boolean })[] };
  }

  // Non-admin users: return only their teams
  const teamsWithMembership = userTeams.map(team => ({
    ...team,
    isMember: true,
  }));

  return {
    ...user,
    teams: teamsWithMembership,
  } as UserWithoutPassword & { teams: (typeof teams.$inferSelect & { isMember: boolean })[] };
};

export const createUser = async (userInfo: {
  email: string;
  password: string;
  language?: string;
}) => {
  const normalizedEmail = normalizeEmail(userInfo.email);
  // Check if user already exists
  const existingUsers = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail));
  if (existingUsers.length > 0) {
    throw new Error("User already exists");
  }

  // Create user
  const hashedPassword = await bcrypt.hash(userInfo.password, 10);

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash: hashedPassword,
      ...(userInfo.language && { language: userInfo.language }),
    })
    .returning({ id: users.id, isAdmin: users.isAdmin });

  return user;
};

export const createUserForInvitation = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  // Check if user already exists
  const existingUsers = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail));
  if (existingUsers.length > 0) {
    return existingUsers[0];
  }

  // Create user with temporary password (they'll need to reset it)
  const tempPassword = randomBytes(32).toString('hex');
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash: hashedPassword,
      emailVerified: false,
    })
    .returning();

  return user;
};

export const checkBasicAuth = async (username: string, password: string) => {
  const normalizedUsername = normalizeEmail(username);
  const user = await db
    .select({
      id: users.id,
      isAdmin: users.isAdmin,
      password: users.passwordHash,
      emailVerified: users.emailVerified,
      language: users.language,
    })
    .from(users)
    .where(eq(users.email, normalizedUsername));

  if (user.length === 0) {
    return {
      user: null,
      passwordMatch: false,
      emailVerified: false,
    }
  }

  const passwordMatch = await bcrypt.compare(password, user[0].password);
  if (!passwordMatch) {
    return {
      user: null,
      passwordMatch: false,
      emailVerified: false,
    }
  }

  if (!user[0].emailVerified) {
    return {
      user: null,
      passwordMatch: true,
      emailVerified: false,
    }
  }

  return {
    user: user[0],
    passwordMatch: true,
    emailVerified: true,
  }
};