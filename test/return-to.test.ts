import { describe, expect, test } from 'bun:test';
import { toLocalPath } from '../lib/return-to';

const origin = 'https://app.example.com';

describe('toLocalPath', () => {
  test('keeps a page on the site with its query and fragment', () => {
    expect(toLocalPath('/documents/doc_1?tab=xml#lines', origin)).toBe('/documents/doc_1?tab=xml#lines');
  });
  test('keeps an absolute URL on the same origin as a path', () => {
    expect(toLocalPath('https://app.example.com/team', origin)).toBe('/team');
  });
  test('refuses anything that would leave the site', () => {
    for (const returnTo of [
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/.//evil.example',
      'https://evil.example/team',
      'javascript:alert(1)',
      'http://[',
    ]) {
      expect(toLocalPath(returnTo, origin)).toBeNull();
    }
  });
  test('ignores a missing returnTo', () => {
    expect(toLocalPath(null, origin)).toBeNull();
    expect(toLocalPath('', origin)).toBeNull();
  });
});
