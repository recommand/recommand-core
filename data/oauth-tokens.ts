import { createHash, randomBytes } from "node:crypto";
import { oauthAccessTokens, oauthClients, oauthGrants, oauthRefreshTokens } from "@core/db/schema";
import { apiResource } from "@core/lib/oauth/resource";
import { getSigningKey, getVerificationKeys } from "@core/lib/signing-keys";
import { db } from "@recommand/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import { ulid } from "ulid";
import type { OAuthGrant } from "./oauth-grants";
import { deleteGrant, findGrant, listGrantPermissionIds, recordGrantUse } from "./oauth-grants";

const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;
const REFRESH_TOKEN_LIFETIME = 30 * 24 * 60 * 60 * 1_000;

// An access token is a JWT (RFC 9068), whose type tells it apart from the other
// tokens the platform signs with the same keys
const ACCESS_TOKEN_TYPE = "at+jwt";
// The prefix tells refresh tokens apart from API keys, and makes leaked ones easy to recognize
const REFRESH_TOKEN_PREFIX = "ort_";

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");
const createToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/**
 * Signs an access token for a grant (RFC 9068, section 2.2): who it acts for,
 * the client, the resources it is meant for (this API unless the client named
 * others) and the permissions the grant holds. The grant's stored permissions
 * still decide each request, so the claims describe the token rather than
 * limit it. A JWT bearer grant has no OAuth client: the system holding the
 * team's key requested it, so its tokens name the team as their `client_id`.
 * Returns `null` when the grant no longer exists.
 */
const signAccessToken = async (grantId: string, resources: string[], expiresAt: Date): Promise<string | null> => {
  const grant = await findGrant(grantId);
  if (!grant?.userId) {
    return null;
  }
  const permissionIdsByTeam = await listGrantPermissionIds(grant.id);
  const permissionIds = [...new Set([...permissionIdsByTeam.values()].flat())];
  // A JWT bearer grant covers the one team whose key signed the assertion
  const clientId = grant.clientId ?? [...permissionIdsByTeam.keys()][0];
  const { key, kid } = await getSigningKey();
  return new SignJWT({ client_id: clientId, scope: permissionIds.join(" ") })
    .setProtectedHeader({ alg: "RS256", kid, typ: ACCESS_TOKEN_TYPE })
    .setAudience(resources.length > 0 ? resources : apiResource())
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .setIssuer(process.env.BASE_URL!)
    .setJti(ulid())
    .setSubject(grant.userId)
    .sign(key);
};

export type IssuedTokens = { accessToken: string; expiresInSeconds: number; refreshToken: string | null };

/**
 * Issues an access token for a grant and, when the client may refresh, a
 * refresh token. Only their hashes are stored. An access token lasts an hour,
 * or less when it has to expire earlier. Returns `null` when the grant was
 * deleted meanwhile, such as by a code presented again.
 */
export const issueTokens = async (input: {
  expiresAt?: Date;
  grantId: string;
  resources: string[];
  withRefreshToken: boolean;
}): Promise<IssuedTokens | null> => {
  const now = Date.now();
  const expiresInSeconds = Math.min(
    ACCESS_TOKEN_LIFETIME_SECONDS,
    input.expiresAt ? Math.floor((input.expiresAt.getTime() - now) / 1_000) : Infinity
  );
  const expiresAt = new Date(now + expiresInSeconds * 1_000);
  const accessToken = await signAccessToken(input.grantId, input.resources, expiresAt);
  if (!accessToken) {
    return null;
  }
  const refreshToken = input.withRefreshToken ? createToken(REFRESH_TOKEN_PREFIX) : null;

  const issued = await db.transaction(async (tx) => {
    // Locked, so the grant can't be deleted while its tokens are stored
    const [grant] = await tx.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.id, input.grantId)).for("share");
    if (!grant) {
      return false;
    }

    // The grant's expired tokens are of no use any more
    await tx
      .delete(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.grantId, input.grantId), lt(oauthAccessTokens.expiresAt, new Date(now))));
    await tx
      .delete(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.grantId, input.grantId), lt(oauthRefreshTokens.expiresAt, new Date(now))));

    await tx.insert(oauthAccessTokens).values({
      expiresAt,
      grantId: input.grantId,
      resources: input.resources,
      tokenHash: hashToken(accessToken),
    });
    if (refreshToken) {
      await tx.insert(oauthRefreshTokens).values({
        expiresAt: new Date(now + REFRESH_TOKEN_LIFETIME),
        grantId: input.grantId,
        resources: input.resources,
        tokenHash: hashToken(refreshToken),
      });
    }
    return true;
  });

  return issued ? { accessToken, expiresInSeconds, refreshToken } : null;
};

/** Whether a token is shaped as one of this server's access tokens, without checking that it's valid. */
export const isOAuthAccessToken = (token: string) => {
  try {
    return decodeProtectedHeader(token).typ === ACCESS_TOKEN_TYPE;
  } catch {
    return false;
  }
};

export type VerifiedAccessToken = {
  grant: OAuthGrant;
  permissionIdsByTeam: Map<string, string[]>;
  resources: string[];
};

/**
 * The grant an access token was issued for, with its permissions per team, or
 * `null` when the token isn't signed by this server, is unknown or expired, or
 * its grant was deleted. A token is checked against its record too, so deleting
 * a grant ends its tokens at once.
 */
export const verifyAccessToken = async (token: string): Promise<VerifiedAccessToken | null> => {
  if (!isOAuthAccessToken(token)) {
    return null;
  }
  try {
    await jwtVerify(token, await getVerificationKeys(), {
      algorithms: ["RS256"],
      issuer: process.env.BASE_URL!,
      typ: ACCESS_TOKEN_TYPE,
    });
  } catch {
    return null;
  }

  const [stored] = await db
    .select({ grant: oauthGrants, resources: oauthAccessTokens.resources })
    .from(oauthAccessTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthAccessTokens.grantId))
    // A disabled client's tokens stop working at once
    .leftJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(
      and(
        eq(oauthAccessTokens.tokenHash, hashToken(token)),
        gt(oauthAccessTokens.expiresAt, new Date()),
        isNull(oauthClients.disabledAt)
      )
    )
    .limit(1);
  if (!stored) {
    return null;
  }

  return { grant: stored.grant, permissionIdsByTeam: await listGrantPermissionIds(stored.grant.id), resources: stored.resources };
};

export type RefreshResult =
  | { grant: OAuthGrant; tokens: IssuedTokens; type: "rotated" }
  | { type: "invalid" }
  | { type: "reused" };

/**
 * Replaces a refresh token with new tokens. A refresh token that was already
 * replaced deletes its whole grant (RFC 9700, section 4.14.2; OAuth 2.1 in
 * draft-ietf-oauth-v2-1-17, section 4.3.1): either the client or someone who
 * stole the token used it before.
 */
export const rotateRefreshToken = async (refreshToken: string, clientId: string): Promise<RefreshResult> => {
  const tokenHash = hashToken(refreshToken);
  const [stored] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, tokenHash)).limit(1);
  if (!stored || stored.expiresAt <= new Date()) {
    return { type: "invalid" };
  }

  const grant = await findGrant(stored.grantId);
  if (!grant || grant.clientId !== clientId) {
    return { type: "invalid" };
  }

  // Marking it used in one statement means two requests can't both rotate it
  const [rotated] = await db
    .update(oauthRefreshTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthRefreshTokens.tokenHash, tokenHash), isNull(oauthRefreshTokens.usedAt)))
    .returning({ tokenHash: oauthRefreshTokens.tokenHash });
  if (!rotated) {
    await deleteGrant(grant.id);
    return { type: "reused" };
  }

  const tokens = await issueTokens({ grantId: grant.id, resources: stored.resources, withRefreshToken: true });
  // The grant was deleted while the token was being replaced
  if (!tokens) {
    return { type: "invalid" };
  }
  await recordGrantUse(grant);
  return { grant, tokens, type: "rotated" };
};

/**
 * Revokes a token on behalf of the client it was issued to (RFC 7009). A refresh
 * token ends its whole grant, since the client signs out with it; an access
 * token ends only itself. Returns the grant's ID, or `null` when nothing
 * was revoked, which the caller must not tell the client.
 */
export const revokeToken = async (token: string, clientId: string): Promise<{ grantId: string; type: "access" | "refresh" } | null> => {
  const tokenHash = hashToken(token);
  if (token.startsWith(REFRESH_TOKEN_PREFIX)) {
    const [stored] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, tokenHash)).limit(1);
    const grant = stored ? await findGrant(stored.grantId) : null;
    if (!grant || grant.clientId !== clientId) {
      return null;
    }
    await deleteGrant(grant.id);
    return { grantId: grant.id, type: "refresh" };
  }

  if (isOAuthAccessToken(token)) {
    const [stored] = await db.select().from(oauthAccessTokens).where(eq(oauthAccessTokens.tokenHash, tokenHash)).limit(1);
    const grant = stored ? await findGrant(stored.grantId) : null;
    if (!grant || grant.clientId !== clientId) {
      return null;
    }
    await db.delete(oauthAccessTokens).where(eq(oauthAccessTokens.tokenHash, tokenHash));
    return { grantId: grant.id, type: "access" };
  }

  return null;
};
