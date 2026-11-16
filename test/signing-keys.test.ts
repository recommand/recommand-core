import { beforeEach, describe, expect, test } from "bun:test";
import { calculateJwkThumbprint, decodeProtectedHeader, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { getPublicKeySet, getSigningKey, getVerificationKeys } from "../lib/signing-keys";

const generate = async () => generateKeyPair("RS256", { extractable: true });
const current = await generate();
const next = await generate();

const publicJwk = async (key: CryptoKey) => {
  const { e, kty, n } = await exportJWK(key);

  return { alg: "RS256", e, kty, n, use: "sig" };
};

const privateJwk = await exportJWK(current.privateKey);
const publicOnly = await publicJwk(current.publicKey);

const sign = async () => {
  const { key, kid } = await getSigningKey();

  return new SignJWT({ purpose: "test" }).setProtectedHeader({ alg: "RS256", kid }).setExpirationTime("5m").sign(key);
};

const verifies = async (jwt: string) => {
  try {
    await jwtVerify(jwt, await getVerificationKeys(), { algorithms: ["RS256"] });

    return true;
  } catch {
    return false;
  }
};

beforeEach(() => {
  delete process.env.SIGNING_KEYS;
  delete process.env.INTEGRATIONS_PRIVATE_KEY;
  delete process.env.INTEGRATIONS_JWKS;
});

describe("with a private key and a published key set", () => {
  beforeEach(async () => {
    process.env.INTEGRATIONS_PRIVATE_KEY = await exportPKCS8(current.privateKey);
    process.env.INTEGRATIONS_JWKS = JSON.stringify({ keys: [await publicJwk(current.publicKey)] });
  });

  test("names the published key after its thumbprint", async () => {
    const kid = await calculateJwkThumbprint(await exportJWK(current.publicKey));
    expect(await getPublicKeySet()).toEqual({ keys: [{ ...(await publicJwk(current.publicKey)), kid }] });
    expect((await getSigningKey()).kid).toBe(kid);
  });

  test("signs tokens that name their key and verify", async () => {
    const jwt = await sign();
    expect(decodeProtectedHeader(jwt).kid).toBe((await getPublicKeySet()).keys[0].kid);
    expect(await verifies(jwt)).toBe(true);
  });

  test("reads a private key whose line breaks became spaces", async () => {
    process.env.INTEGRATIONS_PRIVATE_KEY = (await exportPKCS8(current.privateKey)).replaceAll("\n", " ");
    expect(await verifies(await sign())).toBe(true);
  });

  test("keeps the `kid` the published key already has", async () => {
    process.env.INTEGRATIONS_JWKS = JSON.stringify({ keys: [{ ...(await publicJwk(current.publicKey)), kid: "first" }] });
    expect((await getSigningKey()).kid).toBe("first");
  });

  test("signs without a `kid` when no published key matches, as before", async () => {
    process.env.INTEGRATIONS_JWKS = JSON.stringify({ keys: [await publicJwk(next.publicKey)] });
    expect((await getSigningKey()).kid).toBeUndefined();
  });
});

describe("with a key set to rotate", () => {
  test("signs with the first key and publishes every key, without private members", async () => {
    process.env.SIGNING_KEYS = JSON.stringify({
      keys: [{ ...(await exportJWK(current.privateKey)), kid: "current" }, await exportJWK(next.privateKey)],
    });
    const { keys } = await getPublicKeySet();
    expect(keys).toEqual([
      { ...(await publicJwk(current.publicKey)), kid: "current" },
      { ...(await publicJwk(next.publicKey)), kid: await calculateJwkThumbprint(await exportJWK(next.publicKey)) },
    ]);
    expect((await getSigningKey()).kid).toBe("current");
  });

  test("still verifies what a retired key signed, until it's removed", async () => {
    process.env.SIGNING_KEYS = JSON.stringify({ keys: [await exportJWK(current.privateKey)] });
    const before = await sign();

    process.env.SIGNING_KEYS = JSON.stringify({ keys: [await exportJWK(next.privateKey), await publicJwk(current.publicKey)] });
    expect(await verifies(before)).toBe(true);
    expect(await verifies(await sign())).toBe(true);

    process.env.SIGNING_KEYS = JSON.stringify({ keys: [await exportJWK(next.privateKey)] });
    expect(await verifies(before)).toBe(false);
  });
});

describe("with settings that can't work", () => {
  test("still publishes and verifies when the private key is broken", async () => {
    process.env.INTEGRATIONS_PRIVATE_KEY = "-----BEGIN PRIVATE KEY----- broken -----END PRIVATE KEY-----";
    process.env.INTEGRATIONS_JWKS = JSON.stringify({ keys: [await publicJwk(current.publicKey)] });
    await expect(getSigningKey()).rejects.toThrow();
    expect((await getPublicKeySet()).keys).toHaveLength(1);
  });

  test("refuses a published key that isn't an RSA key", async () => {
    process.env.INTEGRATIONS_JWKS = JSON.stringify({ keys: [{ k: "c2VjcmV0", kty: "oct" }] });
    await expect(getPublicKeySet()).rejects.toThrow("INTEGRATIONS_JWKS key 0 isn't an RSA key");
  });

  test.each([
    ["not json", "SIGNING_KEYS isn't valid JSON"],
    ["{}", "SIGNING_KEYS needs a `keys` array with at least one key"],
    [JSON.stringify({ keys: [] }), "SIGNING_KEYS needs a `keys` array with at least one key"],
    [JSON.stringify({ keys: [privateJwk, { k: "c2VjcmV0", kty: "oct" }] }), "SIGNING_KEYS key 1 isn't an RSA key"],
    [JSON.stringify({ keys: [publicOnly] }), "SIGNING_KEYS key 0 signs, so it needs its private members"],
    [JSON.stringify({ keys: [{ ...privateJwk, kid: "same" }, { ...publicOnly, kid: "same" }] }), "Two published signing keys have the same `kid`"],
  ])("refuses %s with a message that names no key material", async (value, message) => {
    process.env.SIGNING_KEYS = value;
    const error = await getPublicKeySet().then(() => null, (refusal: Error) => refusal.message);
    expect(error).toBe(message);
    expect(error).not.toContain(privateJwk.n!);
  });
});

test("has nothing to sign with or publish without settings", async () => {
  await expect(getSigningKey()).rejects.toThrow("No signing key is configured");
  expect(await getPublicKeySet()).toEqual({ keys: [] });
});
