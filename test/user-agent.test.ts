import { describe, expect, test } from 'bun:test';
import { describeUserAgent } from '../lib/user-agent';

describe('describeUserAgent', () => {
  test('names the browser and system of common user agents', () => {
    const cases: Array<[string, string, string]> = [
      [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
        'Chrome',
        'macOS',
      ],
      [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0',
        'Edge',
        'Windows',
      ],
      [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
        'Safari',
        'iOS',
      ],
      ['Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0', 'Firefox', 'Linux'],
      [
        'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
        'Chrome',
        'Android',
      ],
    ];
    for (const [userAgent, browser, system] of cases) {
      expect(describeUserAgent(userAgent)).toEqual({ browser, system });
    }
  });
  test('leaves what it does not recognise unknown', () => {
    expect(describeUserAgent('curl/8.10.1')).toEqual({ browser: null, system: null });
    expect(describeUserAgent(null)).toEqual({ browser: null, system: null });
  });
});
