import { createHash, randomBytes } from "node:crypto";
import { oauthAuthorizationCodes } from "@core/db/schema";
import { db } from "@recommand/db";
import { lt } from "drizzle-orm";

// The client exchanges the code right after the redirect (RFC 6749, section
// 4.1.2 recommends ten minutes at most)
const AUTHORIZATION_CODE_LIFETIME = 60 * 1_000;

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
  // Codes that were never exchanged go once they have expired
  await db.delete(oauthAuthorizationCodes).where(lt(oauthAuthorizationCodes.expiresAt, new Date()));
  await db.insert(oauthAuthorizationCodes).values({
    ...input,
    codeHash: hashAuthorizationCode(code),
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME),
  });
  return code;
};
