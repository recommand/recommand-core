import { describe, expect, test } from 'bun:test';

// The route module connects to the database and signs JWTs when it's loaded
process.env.DATABASE_URL ??= 'postgres://unused@localhost/unused';
process.env.JWT_SECRET ??= 'api-keys-test-only-signing-key';
const { createApiKeyBodySchema } = await import('../api/api-keys');

describe('creating an API key', () => {
  test('needs the key type', () => {
    expect(createApiKeyBodySchema.safeParse({ name: 'Key' }).success).toBe(false);
  });

  test('lets a Basic key expire, or not', () => {
    expect(createApiKeyBodySchema.parse({ name: 'Key', type: 'basic' })).toEqual({ name: 'Key', type: 'basic' });
    expect(createApiKeyBodySchema.parse({ expiresInSeconds: 3_600, name: 'Key', type: 'basic' })).toEqual({
      expiresInSeconds: 3_600,
      name: 'Key',
      type: 'basic',
    });
  });

  test('gives a JWT key a day by default', () => {
    expect(createApiKeyBodySchema.parse({ name: 'Key', type: 'jwt' })).toEqual({ expiresInSeconds: 86_400, name: 'Key', type: 'jwt' });
  });

  test('refuses an expiry that is fractional, not positive or past any valid date', () => {
    ['basic', 'jwt'].forEach((type) => {
      [1.5, 0, 1e15].forEach((expiresInSeconds) => {
        expect(createApiKeyBodySchema.safeParse({ expiresInSeconds, name: 'Key', type }).success).toBe(false);
      });
    });
  });
});
