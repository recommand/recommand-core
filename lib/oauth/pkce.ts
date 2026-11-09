import { createHash, timingSafeEqual } from "node:crypto";

// 43 to 128 unreserved characters (RFC 7636, section 4.1)
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
// A base64url-encoded SHA-256 hash without padding
const S256_CODE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export const isValidS256CodeChallenge = (codeChallenge: string): boolean => S256_CODE_CHALLENGE.test(codeChallenge);

/** Whether `codeVerifier` is the one `codeChallenge` was made from with S256. */
export const verifyS256CodeChallenge = (codeVerifier: string, codeChallenge: string): boolean => {
  if (!CODE_VERIFIER.test(codeVerifier) || !isValidS256CodeChallenge(codeChallenge)) {
    return false;
  }

  const expected = Buffer.from(createHash("sha256").update(codeVerifier).digest("base64url"));
  return timingSafeEqual(expected, Buffer.from(codeChallenge));
};
