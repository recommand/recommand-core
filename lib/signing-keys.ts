import { createPublicKey } from "node:crypto";
import type { JSONWebKeySet, JWK, JWTVerifyGetKey } from "jose";
import { calculateJwkThumbprint, createLocalJWKSet, importJWK, importPKCS8 } from "jose";

const ALGORITHM = "RS256";

export type SigningKey = { key: CryptoKey; kid: string | undefined };

type PublicKeys = { keySet: JSONWebKeySet; verificationKeys: JWTVerifyGetKey };

// Only what verifies a signature is published, never a private member
const toPublicKey = async (jwk: JWK): Promise<JWK> => ({
  alg: ALGORITHM,
  e: jwk.e,
  kid: jwk.kid ?? (await calculateJwkThumbprint(jwk)),
  kty: jwk.kty,
  n: jwk.n,
  use: "sig",
});

// A PEM pasted into a single-line setting has spaces where its line breaks were
const toPem = (value: string) =>
  value
    .split("-----")
    .map((part, index, parts) =>
      index > 0 && index < parts.length - 1 && !part.includes("BEGIN") && !part.includes("END") ? part.replaceAll(" ", "\n") : part
    )
    .join("-----");

// Only RSA keys sign and verify, so a key of another type can't be published either
const assertRsaKeys = (keys: JWK[], setting: string) => {
  keys.forEach((key, index) => {
    if (key?.kty !== "RSA" || typeof key.n !== "string" || typeof key.e !== "string") {
      throw new Error(`${setting} key ${index} isn't an RSA key`);
    }
  });
};

/**
 * Reads `SIGNING_KEYS`, a JSON Web Key Set (RFC 7517) of RS256 keys, and refuses one that
 * can't work. The errors name the key's position, never its material.
 */
const parseSigningKeys = (value: string): JWK[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("SIGNING_KEYS isn't valid JSON");
  }

  const keys = (parsed as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error("SIGNING_KEYS needs a `keys` array with at least one key");
  }

  assertRsaKeys(keys, "SIGNING_KEYS");
  if (typeof keys[0].d !== "string") {
    throw new Error("SIGNING_KEYS key 0 signs, so it needs its private members");
  }

  return keys;
};

const parseIntegrationKeys = (value: string): JWK[] => {
  const { keys } = JSON.parse(value) as JSONWebKeySet;
  assertRsaKeys(keys, "INTEGRATIONS_JWKS");

  return keys;
};

/**
 * `SIGNING_KEYS`: the first key, which needs its private members, signs, and every
 * one of them is published to verify with. Rotating means adding the next key after
 * the current one, moving it to the front once verifiers have fetched it, and
 * removing the old one when nothing it signed is still valid. A token without a `kid`
 * only verifies while a single key is published, so a second key goes in once the
 * tokens signed without one have expired.
 *
 * Without it, `INTEGRATIONS_PRIVATE_KEY` (a PKCS #8 PEM) signs and the keys in
 * `INTEGRATIONS_JWKS` are published, as before this setting existed.
 */
const loadPublicKeys = async (): Promise<PublicKeys> => {
  const keys = process.env.SIGNING_KEYS
    ? parseSigningKeys(process.env.SIGNING_KEYS)
    : process.env.INTEGRATIONS_JWKS
      ? parseIntegrationKeys(process.env.INTEGRATIONS_JWKS)
      : [];
  const keySet = { keys: await Promise.all(keys.map(toPublicKey)) };
  const kids = keySet.keys.map((key) => key.kid);
  if (new Set(kids).size !== kids.length) {
    throw new Error("Two published signing keys have the same `kid`");
  }

  return { keySet, verificationKeys: createLocalJWKSet(keySet) };
};

const loadSigningKey = async (): Promise<SigningKey | null> => {
  if (process.env.SIGNING_KEYS) {
    const [first] = parseSigningKeys(process.env.SIGNING_KEYS);

    return { key: (await importJWK(first, ALGORITHM)) as CryptoKey, kid: (await toPublicKey(first)).kid };
  }

  if (!process.env.INTEGRATIONS_PRIVATE_KEY) {
    return null;
  }

  const pem = toPem(process.env.INTEGRATIONS_PRIVATE_KEY);
  const key = await importPKCS8(pem, ALGORITHM);
  // Tokens name the published key that verifies them; without one, or when the
  // published keys can't be read, they're signed without a `kid`, as they were before
  const thumbprint = await calculateJwkThumbprint(createPublicKey(pem).export({ format: "jwk" }) as JWK);
  const published = (await publicKeys().catch(() => null))?.keySet.keys ?? [];
  const thumbprints = await Promise.all(published.map((publicKey) => calculateJwkThumbprint(publicKey)));

  return { key, kid: published[thumbprints.indexOf(thumbprint)]?.kid };
};

// Loaded once, and again only when the settings change. The public keys and the
// signing key load apart, so a broken signing key doesn't stop verification.
const cachedPerSettings = <T>(load: () => Promise<T>) => {
  let loaded: { configuration: string; value: Promise<T> } | null = null;

  return () => {
    const configuration = JSON.stringify([
      process.env.SIGNING_KEYS,
      process.env.INTEGRATIONS_PRIVATE_KEY,
      process.env.INTEGRATIONS_JWKS,
    ]);
    if (loaded?.configuration !== configuration) {
      loaded = { configuration, value: load() };
    }

    return loaded.value;
  };
};

const publicKeys = cachedPerSettings(loadPublicKeys);
const signingKey = cachedPerSettings(loadSigningKey);

/** The key the platform signs tokens with, and the `kid` to name in their header. */
export const getSigningKey = async (): Promise<SigningKey> => {
  const key = await signingKey();
  if (!key) {
    throw new Error("No signing key is configured");
  }

  return key;
};

/** The public keys that verify what the platform signs, to publish as a JSON Web Key Set. */
export const getPublicKeySet = async (): Promise<JSONWebKeySet> => (await publicKeys()).keySet;

/** Verifies a signature against every published key, for `jwtVerify`. */
export const getVerificationKeys = async (): Promise<JWTVerifyGetKey> => (await publicKeys()).verificationKeys;
