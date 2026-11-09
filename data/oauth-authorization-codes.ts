import { createHash, randomBytes } from "node:crypto";
import { oauthAuthorizationCodes } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq, isNull, lt } from "drizzle-orm";

// The client exchanges the code right after the redirect (RFC 6749, section
// 4.1.2 recommends ten minutes at most)
const AUTHORIZATION_CODE_LIFETIME = 60 * 1_000;

// How long a code is kept after it expires, so a used one presented again is
// still recognized
const AUTHORIZATION_CODE_RETENTION = 24 * 60 * 60 * 1_000;

const hashAuthorizationCode = (code: string) => createHash("sha256").update(code).digest("base64url");

/**
 * Stores a user's consent as an authorization code for the client, and returns
 * the code. Only its hash is stored.
 */
export const createAuthorizationCode = async (input: {
  clientId: string;
  codeChallenge: string;
  permissionIds: string[];
  redirectUri: string;
  resources: string[];
  teamIds: string[];
  userId: string;
}): Promise<string> => {
  const code = randomBytes(32).toString("base64url");
  await db
    .delete(oauthAuthorizationCodes)
    .where(lt(oauthAuthorizationCodes.expiresAt, new Date(Date.now() - AUTHORIZATION_CODE_RETENTION)));
  await db.insert(oauthAuthorizationCodes).values({
    ...input,
    codeHash: hashAuthorizationCode(code),
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME),
  });
  return code;
};

export type AuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;

export type AuthorizationCodeRedemption =
  | { authorization: AuthorizationCode; type: "redeemed" }
  | { grantId: string | null; type: "reused" }
  | { type: "invalid" };

/**
 * Marks the code used and returns what it was issued for. Marking it in one
 * statement means two requests can never both use it, since a code gives tokens
 * only once. A code presented again is `reused`, with the grant it was
 * exchanged for, if that was recorded yet; the authorization server should then
 * revoke what the code gave (OAuth 2.1 in draft-ietf-oauth-v2-1-17, section
 * 4.1.3).
 */
export const redeemAuthorizationCode = async (code: string): Promise<AuthorizationCodeRedemption> => {
  const codeHash = hashAuthorizationCode(code);
  const [redeemed] = await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthAuthorizationCodes.codeHash, codeHash), isNull(oauthAuthorizationCodes.usedAt)))
    .returning();
  if (redeemed) {
    return redeemed.expiresAt > new Date() ? { authorization: redeemed, type: "redeemed" } : { type: "invalid" };
  }

  const [reused] = await db
    .update(oauthAuthorizationCodes)
    .set({ reusedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .returning({ grantId: oauthAuthorizationCodes.grantId });
  return reused ? { grantId: reused.grantId, type: "reused" } : { type: "invalid" };
};

/**
 * Records the grant a code was exchanged for. Returns `false` when the code was
 * presented again in the meantime, so the grant must not be handed out.
 */
export const recordAuthorizationCodeGrant = async (authorization: AuthorizationCode, grantId: string): Promise<boolean> => {
  const [recorded] = await db
    .update(oauthAuthorizationCodes)
    .set({ grantId })
    .where(eq(oauthAuthorizationCodes.codeHash, authorization.codeHash))
    .returning({ reusedAt: oauthAuthorizationCodes.reusedAt });
  return !recorded?.reusedAt;
};
