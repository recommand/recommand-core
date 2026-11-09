import { describe, expect, test } from 'bun:test';
import { isAllowedRedirectUri } from '../lib/oauth/redirect-uri';

describe('isAllowedRedirectUri', () => {
  test('allows https, and http on a loopback address', () => {
    for (const uri of ['https://client.example/callback', 'http://127.0.0.1/callback', 'http://[::1]:8080/callback', 'http://localhost:3000/cb']) {
      expect(isAllowedRedirectUri(uri)).toBe(true);
    }
  });
  test('refuses other schemes, fragments, credentials and relative URIs', () => {
    for (const uri of ['http://client.example/callback', 'https://client.example/callback#x', 'https://user:pass@client.example/cb', 'javascript:alert(1)', '/callback']) {
      expect(isAllowedRedirectUri(uri)).toBe(false);
    }
  });
});
