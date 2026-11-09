import { describe, expect, test } from 'bun:test';
import { isValidS256CodeChallenge, verifyS256CodeChallenge } from '../lib/oauth/pkce';

// The example of RFC 7636, appendix B
const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE S256', () => {
  test('accepts the verifier a challenge was made from', () => {
    expect(verifyS256CodeChallenge(codeVerifier, codeChallenge)).toBe(true);
  });
  test('refuses another verifier', () => {
    expect(verifyS256CodeChallenge(`${codeVerifier.slice(0, -1)}A`, codeChallenge)).toBe(false);
  });
  test('refuses verifiers outside 43 to 128 unreserved characters', () => {
    expect(verifyS256CodeChallenge('short', codeChallenge)).toBe(false);
    expect(verifyS256CodeChallenge('a'.repeat(129), codeChallenge)).toBe(false);
    expect(verifyS256CodeChallenge(`${codeVerifier.slice(0, -1)}+`, codeChallenge)).toBe(false);
  });
  test('only takes a base64url SHA-256 as a challenge', () => {
    expect(isValidS256CodeChallenge(codeChallenge)).toBe(true);
    expect(isValidS256CodeChallenge(`${codeChallenge}=`)).toBe(false);
    expect(isValidS256CodeChallenge(codeVerifier.slice(0, 42))).toBe(false);
  });
});
