import { type Context } from "@recommand/lib/api";
import {
  getSignedCookie,
  setSignedCookie,
  deleteCookie,
} from "@recommand/lib/api/cookie";
import { checkApiKey, getApiKey, type ApiKey } from "@core/data/api-keys";
import {
  getValidInstallation,
  INSTALLATION_TOKEN_TYPE,
} from "@core/data/installations";
import {
  isValidServiceToken,
  SERVICE_TOKEN_TYPE,
} from "@core/data/service-principals";
import { verify, sign } from "./jwt";
import { addMilliseconds } from "date-fns";
import { db } from "@recommand/db";
import { users } from "@core/db/schema";
import { eq } from "drizzle-orm";

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


export async function createSession(
  c: Context,
  user: { id: string; isAdmin: boolean; language?: string }
) {
  const expires = addMilliseconds(new Date(), cookie.duration);
  const session = await sign({
    userId: user.id,
    isAdmin: user.isAdmin,
    language: user.language ?? "en",
    expires,
  }, expires);

  await setSignedCookie(c, cookie.name, session, process.env.JWT_SECRET!, {
    ...cookie.options,
    expires,
  });
}

export type InstallationSession = {
  id: string;
  teamId: string;
};

export type ServiceSession = {
  id: string;
};

export type Session = {
  userId: string | null;
  isAdmin: boolean;
  language: string;
  apiKey: ApiKey | null;
  teamId: string | null;
  installation: InstallationSession | null;
  service: ServiceSession | null;
}
export type SessionVerificationExtension = (c: Context) => Promise<Session | null>;

export async function verifySession(c: Context, extensions: SessionVerificationExtension[] = []): Promise<{
  userId: string | null;
  isAdmin: boolean;
  apiKey: ApiKey | null;
} | null> {

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  let result: Session | null = null;

  const verificationMethods = [
    verifySessionCookie,
    verifyJwtAuth,
    verifyBasicAuth,
    ...extensions,
  ]

  for (const method of verificationMethods) {
    try {
      const methodResult = await method(c);
      if (methodResult) {
        result = methodResult;
        break; // Stop checking other extensions if one is successful
      }
    } catch (error) {
      console.error(`Error verifying session with method ${method.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!result) return null;

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

  if (result.installation) {
    c.set("installation", result.installation);
  } else {
    c.set("installation", null);
  }

  if (result.service) {
    c.set("service", result.service);
  } else {
    c.set("service", null);
  }

  // Add teamId to context
  if (result.teamId) {
    c.set("teamId", result.teamId);
  }

  return result;
}

export async function deleteSession(c: Context) {
  deleteCookie(c, cookie.name, cookie.options);
}

async function verifySessionCookie(c: Context): Promise<Session | null> {
  const sessionCookie = await getSignedCookie(
    c,
    process.env.JWT_SECRET!,
    cookie.name
  );

  if (!sessionCookie) {
    return null;
  }

  const session = await verify(sessionCookie);
  if (!session?.userId) {
    return null;
  }

  return {
    userId: session.userId as string,
    isAdmin: session.isAdmin as boolean,
    language: (session.language as string) ?? "en",
    apiKey: null,
    teamId: null,
    installation: null,
    service: null,
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
  if (!jwtPayload?.sub) {
    return null;
  }

  if (jwtPayload.tokenType === SERVICE_TOKEN_TYPE) {
    if (
      !jwtPayload.jti ||
      !isValidServiceToken(jwtPayload.sub as string, jwtPayload.jti)
    ) {
      return null;
    }
    return {
      userId: null,
      isAdmin: false,
      language: "en",
      apiKey: null,
      teamId: null,
      installation: null,
      service: { id: jwtPayload.sub as string },
    };
  }

  if (!jwtPayload.jti || !jwtPayload.teamId) {
    return null;
  }

  if (jwtPayload.tokenType === INSTALLATION_TOKEN_TYPE) {
    const installation = await getValidInstallation(
      jwtPayload.sub as string,
      jwtPayload.jti as string,
      jwtPayload.teamId as string
    );
    if (!installation) {
      return null;
    }

    return {
      userId: null,
      isAdmin: false,
      language: "en",
      apiKey: null,
      teamId: installation.teamId,
      installation: {
        id: installation.id,
        teamId: installation.teamId,
      },
      service: null,
    };
  }

  // Cross-check the JWT with the database to ensure it has not been revoked and is fully valid
  const apiKey = await getApiKey(jwtPayload.jti as string);
  if (!apiKey || !apiKey.expiresAt || apiKey.expiresAt <= new Date() || apiKey.type !== "jwt" || apiKey.teamId !== jwtPayload.teamId) {
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
    installation: null,
    service: null,
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
    teamId: apiKey.apiKey.teamId,
    installation: null,
    service: null,
  };
}