import { describe, expect, test } from 'bun:test';
import {
  ClientMetadataUnavailableError,
  clientMetadataSchema,
  fetchClientMetadataDocument,
  parseClientIdUrl,
} from '../lib/oauth/client-metadata';

const clientId = 'https://client.example/oauth/metadata.json';
const document = {
  client_id: clientId,
  client_name: 'Example Client',
  grant_types: ['authorization_code', 'refresh_token'],
  redirect_uris: ['http://127.0.0.1/callback'],
  token_endpoint_auth_method: 'none',
};
const publicLookup = async () => [{ address: '93.184.215.14', family: 4 }];
const serve = (body: unknown, init: ResponseInit = {}) => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('parseClientIdUrl', () => {
  test('accepts an https URL with a path', () => {
    expect(parseClientIdUrl(clientId)?.href).toBe(clientId);
  });
  test('refuses URLs a metadata document must not be fetched from', () => {
    for (const candidate of [
      'http://client.example/metadata.json',
      'https://client.example',
      'https://client.example/',
      'https://client.example:8443/metadata.json',
      'https://user:secret@client.example/metadata.json',
      'https://client.example/metadata.json#fragment',
      'https://client.example/a/../metadata.json',
      'https://CLIENT.example/metadata.json',
      'dcr_01JBQ5ZK6XW9Q2Y8V7R3T4M1N0',
    ]) {
      expect(parseClientIdUrl(candidate)).toBeNull();
    }
  });
});

describe('fetchClientMetadataDocument', () => {
  test('returns the metadata of a valid document', async () => {
    const metadata = await fetchClientMetadataDocument(clientId, { fetch: serve(document), lookup: publicLookup });
    expect(metadata).toEqual({
      client_name: 'Example Client',
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: ['http://127.0.0.1/callback'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });
  test('asks for JSON, follows no redirect and sets a timeout', async () => {
    let init: RequestInit | undefined;
    await fetchClientMetadataDocument(clientId, {
      fetch: async (_url, requestInit) => {
        init = requestInit;
        return serve(document)();
      },
      lookup: publicLookup,
    });
    expect(init).toMatchObject({ headers: { Accept: 'application/json' }, redirect: 'manual' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  test('never contacts a host with a non-public address', async () => {
    let fetched = false;
    await expect(
      fetchClientMetadataDocument(clientId, {
        fetch: async () => {
          fetched = true;
          return serve(document)();
        },
        lookup: async () => [{ address: '169.254.169.254', family: 4 }],
      }),
    ).rejects.toThrow('public addresses');
    expect(fetched).toBe(false);
  });
  test('refuses a redirect, another status, a body that is too large or not JSON', async () => {
    const cases: Array<[Parameters<typeof serve>[0], ResponseInit, string]> = [
      ['', { headers: { Location: 'https://elsewhere.example/' }, status: 302 }, 'answered 302'],
      [document, { status: 404 }, 'answered 404'],
      [{ ...document, client_name: 'x'.repeat(6_000) }, {}, 'larger than'],
      ['not json', {}, 'not JSON'],
      ['[]', {}, 'not a JSON object'],
    ];
    for (const [body, init, message] of cases) {
      await expect(fetchClientMetadataDocument(clientId, { fetch: serve(body, init), lookup: publicLookup })).rejects.toThrow(message);
    }
  });
  test('refuses a document for another client_id, or with a secret', async () => {
    await expect(
      fetchClientMetadataDocument(clientId, { fetch: serve({ ...document, client_id: 'https://other.example/m.json' }), lookup: publicLookup }),
    ).rejects.toThrow('another client_id');
    await expect(
      fetchClientMetadataDocument(clientId, { fetch: serve({ ...document, client_secret: 'shh' }), lookup: publicLookup }),
    ).rejects.toThrow('client secret');
  });
  test('refuses a document with metadata this server does not support', async () => {
    for (const change of [
      { redirect_uris: ['http://client.example/callback'] },
      { redirect_uris: [] },
      { token_endpoint_auth_method: 'client_secret_basic' },
      { grant_types: ['client_credentials'] },
      { grant_types: ['refresh_token'] },
    ]) {
      await expect(
        fetchClientMetadataDocument(clientId, { fetch: serve({ ...document, ...change }), lookup: publicLookup }),
      ).rejects.toThrow('invalid');
    }
  });
  test("counts a host that doesn't resolve, or is too busy, as unavailable for now", async () => {
    const unresolved = fetchClientMetadataDocument(clientId, {
      fetch: serve(document),
      lookup: async () => {
        throw new Error('getaddrinfo ENOTFOUND client.example');
      },
    });
    await expect(unresolved).rejects.toBeInstanceOf(ClientMetadataUnavailableError);
    await expect(fetchClientMetadataDocument(clientId, { fetch: serve(document, { status: 429 }), lookup: publicLookup })).rejects.toBeInstanceOf(
      ClientMetadataUnavailableError,
    );
    // A private address is refused, not waited out
    const privateHost = fetchClientMetadataDocument(clientId, { fetch: serve(document), lookup: async () => [{ address: '10.0.0.1', family: 4 }] });
    await expect(privateHost).rejects.not.toBeInstanceOf(ClientMetadataUnavailableError);
  });
  test('gives up on a document that takes too long', async () => {
    const slow = async (_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(fetchClientMetadataDocument(clientId, { fetch: slow, lookup: publicLookup, timeoutMs: 10 })).rejects.toThrow('could not be fetched');
  });
});

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
