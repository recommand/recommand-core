import { createHash, randomBytes } from "node:crypto";
import { oauthAccessTokens, oauthGrants, oauthRefreshTokens } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { OAuthGrant } from "./oauth-grants";
import { deleteGrant, findGrant } from "./oauth-grants";

export const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;
const REFRESH_TOKEN_LIFETIME = 30 * 24 * 60 * 60 * 1_000;

// The prefixes tell these tokens apart from API keys, and make leaked ones easy to recognize
const ACCESS_TOKEN_PREFIX = "oat_";
const REFRESH_TOKEN_PREFIX = "ort_";

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");
const createToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

export type IssuedTokens = { accessToken: string; refreshToken: string | null };

/**
 * Issues an access token for a grant and, when the client may refresh, a
 * refresh token. Only their hashes are stored. Returns `null` when the grant was
 * deleted meanwhile, such as by a code presented again.
 */
export const issueTokens = async (input: {
  grantId: string;
  resources: string[];
  withRefreshToken: boolean;
}): Promise<IssuedTokens | null> => {
  const now = Date.now();
  const accessToken = createToken(ACCESS_TOKEN_PREFIX);
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
      expiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1_000),
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

  return issued ? { accessToken, refreshToken } : null;
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

  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
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
