import { type Context } from "@recommand/lib/api";
import {
  getSignedCookie,
  setSignedCookie,
  deleteCookie,
} from "@recommand/lib/api/cookie";
import { checkApiKey, getApiKey, type ApiKey } from "@core/data/api-keys";
import { verify, sign } from "./jwt";
import { addMilliseconds } from "date-fns";
import { db } from "@recommand/db";
import { sessions, teamMembers, users } from "@core/db/schema";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import type { Tx } from "@core/data/rules/db";

const cookie = {
  name: "session",
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
  },
  duration: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
};

// How stale a session's `lastSeenAt` may get, so most requests don't write it
const lastSeenInterval = 10 * 60 * 1000;


export type SessionAuthMethod = "email_confirmation" | "password";

type SessionUser = { id: string; isAdmin: boolean; language?: string };

export async function createSession(c: Context, user: SessionUser, authMethod: SessionAuthMethod) {
  const authTime = new Date();
  const expires = addMilliseconds(authTime, cookie.duration);
  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      authMethod,
      authTime,
      userAgent: c.req.header("User-Agent")?.slice(0, 512) ?? null,
      lastSeenAt: authTime,
      expiresAt: expires,
    })
    .returning({ id: sessions.id });

  await setSessionCookie(c, session.id, user, expires);
}

/**
 * Signs the cookie of the current browser session again with fresh user data.
 * The session itself, and when it expires, stay the same.
 */
export async function refreshSession(c: Context, user: SessionUser) {
  const session: { id: string; expiresAt: Date } | undefined = c.get("session");
  if (!session) {
    return;
  }

  await setSessionCookie(c, session.id, user, session.expiresAt);
}

async function setSessionCookie(c: Context, sessionId: string, user: SessionUser, expires: Date) {
  const token = await sign({
    sid: sessionId,
    userId: user.id,
    isAdmin: user.isAdmin,
    language: user.language ?? "en",
    expires,
  }, expires);

  await setSignedCookie(c, cookie.name, token, process.env.JWT_SECRET!, {
    ...cookie.options,
    expires,
  });
}

export type Session = {
  userId: string | null;
  isAdmin: boolean;
  language: string;
  apiKey: ApiKey | null;
  teamId: string | null;
}
export type SessionVerificationExtension = (c: Context) => Promise<Session | null>;
export type AuthenticationMethod = "cookie" | "apiKey" | "extension";

export async function verifySession(c: Context, extensions: SessionVerificationExtension[] = []): Promise<{
  userId: string | null;
  isAdmin: boolean;
  apiKey: ApiKey | null;
} | null> {

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  const verificationMethods: Array<[SessionVerificationExtension, AuthenticationMethod]> = [
    [verifySessionCookie, "cookie"],
    [verifyJwtAuth, "apiKey"],
    [verifyBasicAuth, "apiKey"],
    ...extensions.map((extension) => [extension, "extension"] as [SessionVerificationExtension, AuthenticationMethod]),
  ]

  let authenticated: { result: Session; method: AuthenticationMethod } | null = null;

  for (const [method, label] of verificationMethods) {
    try {
      const methodResult = await method(c);
      if (methodResult) {
        authenticated = { result: methodResult, method: label };
        break; // Stop checking other extensions if one is successful
      }
    } catch (error) {
      console.error(`Error verifying session with method ${method.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!authenticated) return null;
  const { result, method: authenticationMethod } = authenticated;

  // A surviving key must not preserve access after its owner leaves the team.
  if (result.apiKey && !result.isAdmin) {
    const [membership] = await db.select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(
        eq(teamMembers.userId, result.apiKey.userId),
        eq(teamMembers.teamId, result.apiKey.teamId),
      ))
      .limit(1);
    if (!membership) return null;
  }

  c.set("authenticationMethod", authenticationMethod);

  // Add user to context
  c.set("user", {
    id: result.userId,
    isAdmin: result.isAdmin,
  });

  // Add language to context
  c.set("language", result.language ?? "en");

  // Add api key to context
  if (result.apiKey) {
    c.set("apiKey", {
      id: result.apiKey.id,
      teamId: result.apiKey.teamId,
    });
  }

  // Add teamId to context
  if (result.teamId) {
    c.set("teamId", result.teamId);
  }

  return result;
}

/** The stored session the request's cookie belongs to, if it has one. */
export function getCurrentSessionId(c: Context): string | null {
  const session: { id: string } | undefined = c.get("session");
  return session?.id ?? null;
}

/**
 * Ends every stored session of a user, except `except` when given, such as the
 * session that is changing the password.
 */
export async function revokeUserSessions(
  userId: string,
  { except, executor = db }: { except?: string | null; executor?: Tx | typeof db } = {}
) {
  await executor
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
      except ? ne(sessions.id, except) : undefined,
    ));
}

/** A user's sessions that are neither revoked nor expired, most recently used first. */
export async function listUserSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      authMethod: sessions.authMethod,
      authTime: sessions.authTime,
      userAgent: sessions.userAgent,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
}

/** Ends one of a user's sessions. False when the user has no such active session. */
export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length > 0;
}

export async function deleteSession(c: Context) {
  const payload = await readSessionCookie(c);
  if (typeof payload?.sid === "string") {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt)));
  }

  deleteCookie(c, cookie.name, cookie.options);
}

async function readSessionCookie(c: Context) {
  const sessionCookie = await getSignedCookie(
    c,
    process.env.JWT_SECRET!,
    cookie.name
  );

  if (!sessionCookie) {
    return null;
  }

  return verify(sessionCookie);
}

async function findActiveSession(sessionId: string) {
  const [session] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return session;
}

async function verifySessionCookie(c: Context): Promise<Session | null> {
  const session = await readSessionCookie(c);
  if (!session?.userId) {
    return null;
  }

  // A cookie signed before sessions were stored has no `sid`. It stays valid
  // until it expires, at most 14 days after it was signed.
  const storedSession = session.sid === undefined ? null : await findActiveSession(session.sid as string);
  if (session.sid !== undefined && storedSession?.userId !== session.userId) {
    return null;
  }

  const [user] = await db
    .select({ id: users.id, isAdmin: users.isAdmin, language: users.language })
    .from(users)
    .where(eq(users.id, session.userId as string))
    .limit(1);
  if (!user) return null;

  if (storedSession) {
    if (!storedSession.lastSeenAt || Date.now() - storedSession.lastSeenAt.getTime() >= lastSeenInterval) {
      await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, storedSession.id));
    }
    c.set("session", { id: storedSession.id, expiresAt: storedSession.expiresAt });
  }

  return {
    userId: user.id,
    isAdmin: user.isAdmin,
    language: user.language ?? "en",
    apiKey: null,
    teamId: null,
  };
}

async function verifyJwtAuth(c: Context): Promise<Session | null> {
  const authorizationHeader = c.req.header("Authorization")?.split(" ");
  const isAuthorizationHeaderValid = authorizationHeader && authorizationHeader.length === 2;
  if (!isAuthorizationHeaderValid) {
    return null;
  }

  const authorizationType = authorizationHeader[0];
  const encodedCredentials = authorizationHeader[1];

  if (!authorizationType.trim() || !encodedCredentials.trim()) {
    return null;
  }

  if (authorizationType !== "Bearer") {
    return null;
  }

  const jwtPayload = await verify(encodedCredentials);
  if (!jwtPayload?.sub || !jwtPayload.jti || !jwtPayload.teamId) {
    return null;
  }

  // Cross-check the JWT with the database to ensure it has not been revoked and is fully valid
  const apiKey = await getApiKey(jwtPayload.jti as string);
  if (!apiKey || !apiKey.expiresAt || apiKey.expiresAt <= new Date() || apiKey.type !== "jwt" || apiKey.teamId !== jwtPayload.teamId || apiKey.userId !== jwtPayload.sub) {
    return null;
  }

  let isAdmin = false;
  if (jwtPayload.isAdmin) {
    // Double check with the database to ensure the user is an admin, as an extra security measure
    const user = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, jwtPayload.sub as string)).limit(1);
    if (user.length === 0 || !user[0].isAdmin) {
      return null;
    }
    isAdmin = user[0].isAdmin;
  }

  return {
    userId: jwtPayload.sub as string,
    isAdmin,
    language: "en",
    apiKey,
    teamId: apiKey.teamId,
  }

}

async function verifyBasicAuth(c: Context): Promise<Session | null> {
  const authorizationHeader = c.req.header("Authorization")?.split(" ");
  const isAuthorizationHeaderValid = authorizationHeader && authorizationHeader.length === 2;
  if (!isAuthorizationHeaderValid) {
    return null;
  }

  const authorizationType = authorizationHeader[0];
  const encodedCredentials = authorizationHeader[1];

  if (!authorizationType.trim() || !encodedCredentials.trim()) {
    return null;
  }

  if (authorizationType !== "Basic") {
    return null;
  }

  const credentials = Buffer.from(encodedCredentials, "base64").toString("utf-8");
  const [apiKeyId, secret] = credentials.split(":");
  const apiKey = await checkApiKey(apiKeyId, secret);
  if (!apiKey) {
    return null;
  }

  return {
    userId: apiKey.user.id,
    isAdmin: apiKey.user.isAdmin,
    language: "en",
    apiKey: apiKey.apiKey,
    teamId: apiKey.apiKey.teamId
  };
}
