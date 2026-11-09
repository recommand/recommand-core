import type { JSONWebKeySet, JWK, JWTVerifyGetKey } from "jose";
import { calculateJwkThumbprint, createLocalJWKSet, exportJWK, importJWK, importPKCS8 } from "jose";

const ALGORITHM = "RS256";

export type SigningKey = { key: CryptoKey; kid: string | undefined };

type SigningKeys = { publicKeys: JWK[]; signingKey: SigningKey | null };

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

/**
 * `SIGNING_KEYS` is a JSON Web Key Set (RFC 7517) of RS256 keys: the first one,
 * which needs its private members, signs, and every one of them is published to
 * verify with. Rotating means adding the next key after the current one, moving
 * it to the front once verifiers have fetched it, and removing the old one when
 * nothing it signed is still valid.
 *
 * Without it, `INTEGRATIONS_PRIVATE_KEY` (a PKCS #8 PEM) signs and the keys in
 * `INTEGRATIONS_JWKS` are published, as before this setting existed.
 */
const loadSigningKeys = async (): Promise<SigningKeys> => {
  if (process.env.SIGNING_KEYS) {
    const { keys } = JSON.parse(process.env.SIGNING_KEYS) as JSONWebKeySet;
    const publicKeys = await Promise.all(keys.map(toPublicKey));
    if (keys.length === 0) {
      return { publicKeys, signingKey: null };
    }
    return {
      publicKeys,
      signingKey: { key: (await importJWK(keys[0], ALGORITHM)) as CryptoKey, kid: publicKeys[0].kid },
    };
  }

  const publicKeys = process.env.INTEGRATIONS_JWKS
    ? await Promise.all((JSON.parse(process.env.INTEGRATIONS_JWKS) as JSONWebKeySet).keys.map(toPublicKey))
    : [];
  if (!process.env.INTEGRATIONS_PRIVATE_KEY) {
    return { publicKeys, signingKey: null };
  }
  const key = await importPKCS8(toPem(process.env.INTEGRATIONS_PRIVATE_KEY), ALGORITHM, { extractable: true });
  // Tokens name the published key that verifies them; without one, they're
  // signed without a `kid`, as they were before
  const thumbprint = await calculateJwkThumbprint(await exportJWK(key));
  const thumbprints = await Promise.all(publicKeys.map((publicKey) => calculateJwkThumbprint(publicKey)));
  return { publicKeys, signingKey: { key, kid: publicKeys[thumbprints.indexOf(thumbprint)]?.kid } };
};

let loaded: { configuration: string; keys: Promise<SigningKeys> } | null = null;

// Loaded once, and again only when the settings change
const signingKeys = () => {
  const configuration = JSON.stringify([
    process.env.SIGNING_KEYS,
    process.env.INTEGRATIONS_PRIVATE_KEY,
    process.env.INTEGRATIONS_JWKS,
  ]);
  if (loaded?.configuration !== configuration) {
    loaded = { configuration, keys: loadSigningKeys() };
  }
  return loaded.keys;
};

/** The key the platform signs tokens with, and the `kid` to name in their header. */
export const getSigningKey = async (): Promise<SigningKey> => {
  const { signingKey } = await signingKeys();
  if (!signingKey) {
    throw new Error("No signing key is configured");
  }
  return signingKey;
};

/** The public keys that verify what the platform signs, to publish as a JSON Web Key Set. */
export const getPublicKeySet = async (): Promise<JSONWebKeySet> => ({ keys: (await signingKeys()).publicKeys });

/** Verifies a signature against every published key, for `jwtVerify`. */
export const getVerificationKeys = async (): Promise<JWTVerifyGetKey> => createLocalJWKSet(await getPublicKeySet());
