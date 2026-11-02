import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** How long an action link works. */
export const ACTION_TOKEN_LIFETIME_MS = 72 * 60 * 60 * 1000; // 72 hours

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }
  return process.env.JWT_SECRET;
}

function signature(id: string) {
  return createHmac("sha256", secret()).update(`notification-action:${id}`).digest("base64url");
}

export function hashTokenId(id: string) {
  return createHash("sha256").update(id).digest("hex");
}

/**
 * A new action token: a random id with the server's signature. Only the
 * message carries the token; the database stores the hash of the id.
 */
export function createActionToken(): { token: string; hash: string } {
  const id = randomBytes(24).toString("base64url");
  return { token: `${id}.${signature(id)}`, hash: hashTokenId(id) };
}

/** The hash to look up, or null when the token is malformed or its signature is wrong. */
export function verifyActionToken(token: string): string | null {
  const [id, given, ...rest] = token.split(".");
  if (!id || !given || rest.length > 0) {
    return null;
  }
  const expected = Buffer.from(signature(id));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return hashTokenId(id);
}
