import { describe, expect, test } from 'bun:test';
import { isAllowedRedirectUri, matchesRedirectUri } from '../lib/oauth/redirect-uri';

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

describe('matchesRedirectUri', () => {
  test('matches a registered URI exactly', () => {
    expect(matchesRedirectUri('https://client.example/callback', ['https://client.example/callback'])).toBe(true);
    expect(matchesRedirectUri('https://client.example/callback/', ['https://client.example/callback'])).toBe(false);
    expect(matchesRedirectUri('https://client.example/callback?x=1', ['https://client.example/callback'])).toBe(false);
  });
  test('lets a loopback URI use any port', () => {
    expect(matchesRedirectUri('http://127.0.0.1:53124/callback', ['http://127.0.0.1/callback'])).toBe(true);
    expect(matchesRedirectUri('http://127.0.0.1:53124/other', ['http://127.0.0.1/callback'])).toBe(false);
    expect(matchesRedirectUri('http://localhost:53124/callback', ['http://127.0.0.1/callback'])).toBe(false);
  });
  test('keeps the port of an https URI', () => {
    expect(matchesRedirectUri('https://client.example:8443/callback', ['https://client.example/callback'])).toBe(false);
  });
});
