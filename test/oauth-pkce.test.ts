import { describe, expect, test } from 'bun:test';
import { isValidS256CodeChallenge } from '../lib/oauth/pkce';

// The example of RFC 7636, appendix B
const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE S256', () => {
  test('only takes a base64url SHA-256 as a challenge', () => {
    expect(isValidS256CodeChallenge(codeChallenge)).toBe(true);
    expect(isValidS256CodeChallenge(`${codeChallenge}=`)).toBe(false);
    expect(isValidS256CodeChallenge(codeVerifier.slice(0, 42))).toBe(false);
  });
});
