import type { Context } from "hono";
import { recordGrantUse } from "@core/data/oauth-grants";
import { isOAuthAccessToken, verifyAccessToken } from "@core/data/oauth-tokens";
import { users } from "@core/db/schema";
import { apiResource, protectedResourceMetadataUrl } from "@core/lib/oauth/resource";
import { db } from "@recommand/db";
import { eq } from "drizzle-orm";
import type { Session } from "../session";

/** The grant behind a request's OAuth access token, for checks that read `c.var.grant`. */
export type RequestGrant = {
  // Null for a token from the JWT bearer flow
  clientId: string | null;
  id: string;
  permissionIdsByTeam: Map<string, string[]>;
};

const bearerToken = (c: Context): string | null => {
  const [scheme, token] = c.req.header("Authorization")?.split(" ") ?? [];
  // The scheme is case-insensitive (RFC 7235, section 2.1)
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
};

/** Whether the request presents one of this server's access tokens, valid or not. */
export const presentsOAuthAccessToken = (c: Context) => {
  const token = bearerToken(c);
  return token !== null && isOAuthAccessToken(token);
};

/**
 * Verifies an OAuth access token (RFC 6750) as one more way to authenticate. It
 * never carries admin access, and isn't bound to one team: the grant says which
 * teams it reaches.
 */
export const verifyOAuthAccessToken = async (c: Context): Promise<Session | null> => {
  const token = bearerToken(c);
  const verified = token ? await verifyAccessToken(token) : null;
  if (!verified?.grant.userId) {
    return null;
  }
  // A token meant for another resource isn't for this API (RFC 8707, section 2);
  // one without any is, since a client doesn't have to name the resource
  if (verified.resources.length > 0 && !verified.resources.includes(apiResource())) {
    return null;
  }

  const [user] = await db
    .select({ language: users.language })
    .from(users)
    .where(eq(users.id, verified.grant.userId))
    .limit(1);
  if (!user) {
    return null;
  }
  await recordGrantUse(verified.grant);

  return {
    apiKey: null,
    grant: { clientId: verified.grant.clientId, id: verified.grant.id, permissionIdsByTeam: verified.permissionIdsByTeam },
    isAdmin: false,
    language: user.language ?? "en",
    teamId: null,
    userId: verified.grant.userId,
  };
};

/**
 * Tells an OAuth client what to do next (RFC 6750, section 3): which permission
 * to ask the user for, or that its token is no longer valid, and where to find
 * this API's metadata (RFC 9728, section 5.1).
 */
export const setBearerChallenge = (
  c: Context,
  challenge: { error?: "insufficient_scope" | "invalid_token"; scope?: string } = {}
) => {
  const parameters = [
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
    challenge.error ? `error="${challenge.error}"` : null,
    // Only a missing permission names what to ask for
    challenge.scope ? `scope="${challenge.scope}"` : null,
  ].filter(Boolean);
  c.header("WWW-Authenticate", `Bearer ${parameters.join(", ")}`);
};
