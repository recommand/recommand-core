// A base64url-encoded SHA-256 hash without padding
const S256_CODE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export const isValidS256CodeChallenge = (codeChallenge: string): boolean => S256_CODE_CHALLENGE.test(codeChallenge);
