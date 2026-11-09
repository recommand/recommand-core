import { oauthAccessTokens, oauthGrants, oauthRefreshTokens } from "@core/db/schema";
import { apiResource } from "@core/lib/oauth/resource";
import { getSigningKey } from "@core/lib/signing-keys";
import { db } from "@recommand/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { SignJWT } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { ulid } from "ulid";
import type { OAuthGrant } from "./oauth-grants";
import { deleteGrant, findGrant, listGrantPermissionIds } from "./oauth-grants";

export const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;
const REFRESH_TOKEN_LIFETIME = 30 * 24 * 60 * 60 * 1_000;
// A client that refreshes from several places at once, such as tabs or an assistant's
// parallel tool calls, presents the same token again within moments. Ten seconds
// covers that on a slow network, while a token replayed later, such as from a log
// or by whoever stole it, still ends the grant.
const REFRESH_TOKEN_REUSE_GRACE_MS = 10 * 1_000;

const isWithinReuseGrace = (usedAt: Date | null) => usedAt !== null && Date.now() - usedAt.getTime() < REFRESH_TOKEN_REUSE_GRACE_MS;

// An access token is a JWT (RFC 9068), whose type tells it apart from the other
// tokens the platform signs with the same keys
const ACCESS_TOKEN_TYPE = "at+jwt";
// The prefix tells refresh tokens apart from API keys, and makes leaked ones easy to recognize
const REFRESH_TOKEN_PREFIX = "ort_";

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");
const createToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/**
 * Signs an access token for a grant (RFC 9068, section 2.2): who it acts for,
 * the client, the resources it is meant for (this API unless the client named
 * others) and the permissions the grant holds. The grant's stored permissions
 * still decide each request, so the claims describe the token rather than
 * limit it. Returns `null` when the grant no longer exists.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9068#section-2.2
 */
const signAccessToken = async (grantId: string, resources: string[], expiresAt: Date): Promise<string | null> => {
  const grant = await findGrant(grantId);
  if (!grant?.userId) {
    return null;
  }

  const permissionIdsByTeam = await listGrantPermissionIds(grant.id);
  const permissionIds = [...new Set([...permissionIdsByTeam.values()].flat())];
  const { key, kid } = await getSigningKey();

  return new SignJWT({ client_id: grant.clientId, scope: permissionIds.join(" ") })
    .setProtectedHeader({ alg: "RS256", kid, typ: ACCESS_TOKEN_TYPE })
    .setAudience(resources.length > 0 ? resources : apiResource())
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .setIssuer(process.env.BASE_URL!)
    .setJti(ulid())
    .setSubject(grant.userId)
    .sign(key);
};

export type IssuedTokens = { accessToken: string; refreshToken: string | null };

type TokenInput = {
  grantId: string;
  // What the refresh token keeps, so a later refresh can ask for any of them again; the access token's by default
  refreshTokenResources?: string[];
  resources: string[];
  withRefreshToken: boolean;
};

type SignedTokens = IssuedTokens & { expiresAt: Date; now: number };

// Signing happens before anything is stored, so a key that can't sign changes nothing
const signTokens = async (input: TokenInput): Promise<SignedTokens | null> => {
  const now = Date.now();
  const expiresAt = new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1_000);
  const accessToken = await signAccessToken(input.grantId, input.resources, expiresAt);
  if (!accessToken) {
    return null;
  }

  return { accessToken, expiresAt, now, refreshToken: input.withRefreshToken ? createToken(REFRESH_TOKEN_PREFIX) : null };
};

type TokenWriter = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Returns `false` when the grant was deleted meanwhile
const storeTokens = async (tx: TokenWriter, input: TokenInput, signed: SignedTokens) => {
  // Locked, so the grant can't be deleted while its tokens are stored
  const [grant] = await tx.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.id, input.grantId)).for("share");
  if (!grant) {
    return false;
  }

  // The grant's expired tokens are of no use any more
  await tx
    .delete(oauthAccessTokens)
    .where(and(eq(oauthAccessTokens.grantId, input.grantId), lt(oauthAccessTokens.expiresAt, new Date(signed.now))));
  await tx
    .delete(oauthRefreshTokens)
    .where(and(eq(oauthRefreshTokens.grantId, input.grantId), lt(oauthRefreshTokens.expiresAt, new Date(signed.now))));

  await tx.insert(oauthAccessTokens).values({
    expiresAt: signed.expiresAt,
    grantId: input.grantId,
    resources: input.resources,
    tokenHash: hashToken(signed.accessToken),
  });
  if (signed.refreshToken) {
    await tx.insert(oauthRefreshTokens).values({
      expiresAt: new Date(signed.now + REFRESH_TOKEN_LIFETIME),
      grantId: input.grantId,
      resources: input.refreshTokenResources ?? input.resources,
      tokenHash: hashToken(signed.refreshToken),
    });
  }

  return true;
};

const toIssued = ({ accessToken, refreshToken }: SignedTokens): IssuedTokens => ({ accessToken, refreshToken });

/**
 * Issues an access token for a grant and, when the client may refresh, a
 * refresh token. Only their hashes are stored. Returns `null` when the grant was
 * deleted meanwhile, such as by a code presented again.
 */
export const issueTokens = async (input: TokenInput): Promise<IssuedTokens | null> => {
  const signed = await signTokens(input);
  if (!signed) {
    return null;
  }

  return (await db.transaction((tx) => storeTokens(tx, input, signed))) ? toIssued(signed) : null;
};

export type RefreshResult =
  | { grant: OAuthGrant; tokens: IssuedTokens; type: "rotated" }
  | { type: "invalid" }
  | { type: "invalid_target" }
  // The deleted grant, so the reuse can be recorded against it
  | { grant: OAuthGrant; teamIds: string[]; type: "reused" };

/**
 * Replaces a refresh token with new tokens. A refresh token that was already
 * replaced deletes its whole grant (RFC 9700, section 4.14.2; OAuth 2.1 in
 * draft-ietf-oauth-v2-1-17, section 4.3.1): either the client or someone who
 * stole the token used it before. Within seconds of its replacement it's only
 * refused, since the client may have sent it twice at once. The new access
 * token can be narrowed to some of the refresh token's resources; the new
 * refresh token keeps them all.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9700#section-4.14.2
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-17#section-4.3.1
 */
export const rotateRefreshToken = async (refreshToken: string, clientId: string, requestedResources: string[] = []): Promise<RefreshResult> => {
  const tokenHash = hashToken(refreshToken);
  const [stored] = await db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, tokenHash)).limit(1);
  if (!stored || stored.expiresAt <= new Date()) {
    return { type: "invalid" };
  }

  const grant = await findGrant(stored.grantId);
  if (!grant || grant.clientId !== clientId || isWithinReuseGrace(stored.usedAt)) {
    return { type: "invalid" };
  }

  // Never widened (RFC 8707, section 2.2), and refused before the token is used up, so the client can try again
  if (!requestedResources.every((resource) => stored.resources.includes(resource))) {
    return { type: "invalid_target" };
  }

  const input = {
    grantId: grant.id,
    refreshTokenResources: stored.resources,
    resources: requestedResources.length > 0 ? requestedResources : stored.resources,
    withRefreshToken: true,
  };
  const signed = await signTokens(input);
  // The grant was deleted while the token was being replaced
  if (!signed) {
    return { type: "invalid" };
  }

  // Marking the token used and storing its successor happen together: a failure
  // leaves the token usable, rather than making the retry look like a reuse
  const outcome = await db.transaction(async (tx) => {
    const [rotated] = await tx
      .update(oauthRefreshTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.tokenHash, tokenHash), isNull(oauthRefreshTokens.usedAt)))
      .returning({ tokenHash: oauthRefreshTokens.tokenHash });
    if (!rotated) {
      const [used] = await tx
        .select({ usedAt: oauthRefreshTokens.usedAt })
        .from(oauthRefreshTokens)
        .where(eq(oauthRefreshTokens.tokenHash, tokenHash));

      return isWithinReuseGrace(used?.usedAt ?? null) ? ("invalid" as const) : ("reused" as const);
    }

    return (await storeTokens(tx, input, signed)) ? ("rotated" as const) : ("invalid" as const);
  });
  if (outcome === "reused") {
    const teamIds = [...(await listGrantPermissionIds(grant.id)).keys()];
    await deleteGrant(grant.id);

    return { grant, teamIds, type: "reused" };
  }

  if (outcome === "invalid") {
    return { type: "invalid" };
  }

  return { grant, tokens: toIssued(signed), type: "rotated" };
};
