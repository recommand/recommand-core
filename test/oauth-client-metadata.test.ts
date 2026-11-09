import { describe, expect, test } from 'bun:test';
import { clientMetadataSchema } from '../lib/oauth/client-metadata';

describe('clientMetadataSchema', () => {
  test('defaults a registration to the authorization code flow without a secret', () => {
    expect(clientMetadataSchema.parse({ redirect_uris: ['https://client.example/cb'] })).toEqual({
      grant_types: ['authorization_code'],
      redirect_uris: ['https://client.example/cb'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });
  test('accepts a client that supports none among its authentication methods, or names none', () => {
    for (const methods of [
      {},
      { token_endpoint_auth_method: 'none' },
      { token_endpoint_auth_methods_supported: ['none'] },
      { token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['private_key_jwt', 'none'] },
    ]) {
      expect(clientMetadataSchema.parse({ redirect_uris: ['https://client.example/cb'], ...methods }).token_endpoint_auth_method).toBe('none');
    }
  });
  test('refuses a client that cannot authenticate with none', () => {
    for (const methods of [
      { token_endpoint_auth_method: 'client_secret_basic' },
      { token_endpoint_auth_methods_supported: ['private_key_jwt'] },
      { token_endpoint_auth_method: 'none', token_endpoint_auth_methods_supported: ['private_key_jwt'] },
      { token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none'] },
    ]) {
      expect(clientMetadataSchema.safeParse({ redirect_uris: ['https://client.example/cb'], ...methods }).success).toBe(false);
    }
  });
});
