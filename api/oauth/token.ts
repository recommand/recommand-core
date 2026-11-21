import { jwtVerifyClientSignedJWT } from "@core/data/oauth";
import type { AuthorizationCode } from "@core/data/oauth-authorization-codes";
import { markAuthorizationCodeReused, recordAuthorizationCodeGrant, redeemAuthorizationCode } from "@core/data/oauth-authorization-codes";
import { findRequestClient } from "@core/data/oauth-clients";
import type { OAuthGrant } from "@core/data/oauth-grants";
import {
  createGrant,
  deleteGrant,
  listGrantPermissionIds,
  OAuthGrantError,
  prepareAssertionGrant,
} from "@core/data/oauth-grants";
import type { IssuedTokens } from "@core/data/oauth-tokens";
import { issueTokens, rotateRefreshToken } from "@core/data/oauth-tokens";
import { getTeam } from "@core/data/teams";
import { audit } from "@core/lib/audit";
import { JWT_BEARER_GRANT_TYPE } from "@core/lib/oauth/jwt-bearer";
import { verifyS256CodeChallenge } from "@core/lib/oauth/pkce";
import { supportedResources } from "@core/lib/oauth/resource";
import { hasSigningKey } from "@core/lib/signing-keys";
import { Server } from "@recommand/lib/api";
import { zodResolver } from "@recommand/lib/zod-validator";
import { fromUnixTime } from "date-fns";
import type { Context } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { describeOAuthRequestBody, describeOAuthResponse, oauthErrorSchema } from "./responses";

const server = new Server();

const tokenTeamSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    scope: z.string().openapi({ description: "The permissions the grant holds in this team, separated by spaces." }),
  })
  .openapi({ ref: "OAuthTokenTeam" });

const tokenResponseSchema = z
  .object({
    access_token: z.string(),
    expires_in: z.number().int().openapi({ description: "Seconds until the access token expires." }),
    refresh_token: z.string().optional(),
    scope: z.string().openapi({ description: "The granted permissions, separated by spaces." }),
    teams: z.array(tokenTeamSchema).openapi({ description: "The grant's teams, with what it holds in each." }),
    token_type: z.literal("Bearer"),
  })
  .openapi({ ref: "OAuthTokenResponse" });

const tokenRequestSchema = z
  .object({
    assertion: z.string().optional().openapi({ description: `For \`${JWT_BEARER_GRANT_TYPE}\`: the JWT the team signed.` }),
    client_id: z.string().optional().openapi({ description: "For `authorization_code` and `refresh_token`: the client." }),
    code: z.string().optional().openapi({ description: "For `authorization_code`: the code the authorization endpoint returned." }),
    code_verifier: z.string().optional().openapi({ description: "For `authorization_code`: the PKCE verifier of the code's challenge." }),
    grant_type: z.enum(["authorization_code", "refresh_token", JWT_BEARER_GRANT_TYPE]),
    redirect_uri: z.string().optional().openapi({ description: "For `authorization_code`: the redirect URI the code was sent to." }),
    refresh_token: z.string().optional().openapi({ description: "For `refresh_token`: the refresh token to replace." }),
    resource: z.array(z.string()).optional().openapi({ description: "The resources the access token is meant for (RFC 8707); this API without it." }),
  })
  .openapi({ description: "A token request: the fields its grant type uses." });

type TokenError =
  | "invalid_client"
  | "invalid_grant"
  | "invalid_request"
  | "invalid_target"
  | "temporarily_unavailable"
  | "unauthorized_client"
  | "unsupported_grant_type";

const cacheControlHeaderSchema = z.literal("no-store").openapi({
  description: "Always `no-store`: a token response is never cached (RFC 6749, section 5.1).",
  ref: "CacheControlNoStoreHeader",
});

// Documents the `Cache-Control` header `respond` sends on every described response
const withNoStore = <Responses extends Record<number, object>>(responses: Responses): Responses =>
  Object.fromEntries(
    Object.entries(responses).map(([status, response]: [string, { headers?: object }]) => [
      status,
      {
        ...response,
        headers: {
          ...response.headers,
          "Cache-Control": { schema: zodResolver(cacheControlHeaderSchema) },
        },
      },
    ])
  ) as Responses;

// Token responses must never be cached (RFC 6749, section 5.1)
const respond = (c: Context, body: Record<string, unknown>, status: 200 | 400 | 503 = 200) => {
  c.header("Cache-Control", "no-store");

  return c.json(body, status);
};

const fail = (c: Context, error: TokenError, description: string, status: 400 | 503 = 400) =>
  respond(c, { error, error_description: description }, status);

// Lists the grant's teams with what it holds in each, so a client with several
// knows which teams it can name in a request
const tokenResponse = async (c: Context, tokens: IssuedTokens, permissionIdsByTeam: Map<string, string[]>) => {
  const teams = await Promise.all(
    [...permissionIdsByTeam].map(async ([teamId, permissionIds]) => ({
      id: teamId,
      name: (await getTeam(teamId))?.name ?? null,
      scope: permissionIds.join(" "),
    }))
  );

  return respond(c, {
    access_token: tokens.accessToken,
    expires_in: tokens.expiresInSeconds,
    ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
    scope: [...new Set([...permissionIdsByTeam.values()].flat())].join(" "),
    teams,
    token_type: "Bearer",
  });
};

// Why a request can't exchange the code it names, or `null` when it can
const codeRequestError = (authorization: AuthorizationCode, request: { clientId: string; codeVerifier: string; redirectUri: string | undefined }) => {
  if (authorization.clientId !== request.clientId) {
    return "The code is invalid, expired or already used";
  }

  if (request.redirectUri !== undefined && request.redirectUri !== authorization.redirectUri) {
    return "The redirect_uri differs from the authorization request's";
  }

  if (!verifyS256CodeChallenge(request.codeVerifier, authorization.codeChallenge)) {
    return "The code_verifier doesn't match the code_challenge";
  }

  return null;
};

// A code presented twice may have been stolen, so what it gave is deleted
const deleteReusedCodeGrant = async (c: Context, grantId: string | null) => {
  if (!grantId || !(await deleteGrant(grantId))) {
    return;
  }

  await audit(c, {
    action: "revoke_access",
    objectId: grantId,
    objectType: "core.oauth_grant",
    reasonCode: "authorization_code_reused",
    subsystem: "core.oauth",
  });
};

// An assertion that lasted longer would work like a key, without the team's
// private key ever being needed again (RFC 7523, section 3, lets a server refuse it)
const MAX_ASSERTION_LIFETIME_SECONDS = 3_600;

/**
 * The JWT bearer grant (RFC 7523, section 2.1): an assertion signed with a key
 * the team registered, naming one of its members, buys an access token without
 * a client. The assertion is signed with RS256; its `iss` and `sub` are the
 * team's ID, `team_id` and `user_id` name the team and the member, `aud` is this
 * server's issuer or its token endpoint (RFC 7523, section 3, as updated by
 * RFC 10070, section 4), and `exp` is at most an hour away. The
 * token carries what the user can delegate there as a member, never admin
 * access, and expires with the assertion. There is no refresh token: the team
 * signs a new assertion instead.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7523#section-2.1
 * @see https://www.rfc-editor.org/rfc/rfc7523#section-3
 * @see https://www.rfc-editor.org/rfc/rfc10070#section-4
 */
const exchangeAssertion = async (c: Context, assertion: string | undefined, resources: string[]) => {
  if (!assertion) {
    return fail(c, "invalid_request", "The request has no assertion");
  }

  if (!resources.every((resource) => supportedResources().includes(resource))) {
    return fail(c, "invalid_target", `Tokens can only be issued for ${supportedResources().join(", ")}`);
  }

  // The audience identifies this authorization server: its issuer or its token endpoint (RFC 7523,
  // section 3, as updated by RFC 10070, section 4)
  const issuer = process.env.BASE_URL!;
  const verified = await jwtVerifyClientSignedJWT(assertion, [issuer, `${issuer}/api/core/oauth/token`]);
  if (!verified || verified.payload.exp === undefined) {
    return fail(c, "invalid_grant", "The assertion could not be verified");
  }

  if (verified.payload.exp > Math.floor(Date.now() / 1_000) + MAX_ASSERTION_LIFETIME_SECONDS) {
    return fail(c, "invalid_grant", "The assertion must expire within an hour");
  }

  const prepared = await prepareAssertionGrant(verified.userId, verified.teamId);
  if (!prepared) {
    return fail(c, "invalid_grant", "The user holds no permission that can be granted in this team");
  }

  const tokens = await issueTokens({
    expiresAt: fromUnixTime(verified.payload.exp),
    grantId: prepared.grant.id,
    resources,
    withRefreshToken: false,
  });
  // The user left the team while the tokens were being issued
  if (!tokens) {
    return fail(c, "invalid_grant", "The user holds no permission that can be granted in this team");
  }

  if (prepared.created) {
    await audit(c, {
      action: "create",
      actorUserId: verified.userId,
      objectId: prepared.grant.id,
      objectType: "core.oauth_grant",
      subsystem: "core.oauth",
      teamId: verified.teamId,
    });
  }

  return tokenResponse(c, tokens, new Map([[verified.teamId, prepared.permissionIds]]));
};

/**
 * The token endpoint (RFC 6749, section 3.2) of this authorization server: it
 * exchanges authorization codes, refresh tokens and JWT bearer assertions.
 * `/oauth2/token` keeps issuing JWT API keys for assertions, as before.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.2
 */
const _token = server.post(
  "/oauth/token",
  describeRoute({
    description: "Exchange an authorization code, a refresh token or a JWT bearer assertion for tokens (RFC 6749, section 3.2).",
    hide: true,
    operationId: "requestOAuthToken",
    requestBody: describeOAuthRequestBody("application/x-www-form-urlencoded", tokenRequestSchema),
    responses: withNoStore({
      ...describeOAuthResponse(200, "The tokens", tokenResponseSchema),
      ...describeOAuthResponse(400, "The request can't be granted", oauthErrorSchema),
      ...describeOAuthResponse(503, "The server can't sign tokens right now; the request changed nothing", oauthErrorSchema),
    }),
    security: [],
    summary: "Request an OAuth Token",
    tags: ["OAuth"],
  }),
  async (c) => {
    const form = await c.req.parseBody({ all: true }).catch(() => ({}));
    const field = (name: string) => {
      const value = (form as Record<string, unknown>)[name];

      return typeof value === "string" ? value : undefined;
    };
    const resourcesField = (form as Record<string, unknown>).resource;
    const resources = [resourcesField].flat().filter((value): value is string => typeof value === "string");

    // Checked before anything is redeemed or rotated, so the client can simply try again
    if (!(await hasSigningKey())) {
      return fail(c, "temporarily_unavailable", "The server can't issue tokens right now", 503);
    }

    // The team's key vouches for a JWT bearer assertion, so it needs no client
    if (field("grant_type") === JWT_BEARER_GRANT_TYPE) {
      return exchangeAssertion(c, field("assertion"), resources);
    }

    const client = await findRequestClient(field("client_id"));
    if (!client) {
      return fail(c, "invalid_client", "The client is unknown or disabled");
    }

    const grantType = field("grant_type");
    if (grantType !== "authorization_code" && grantType !== "refresh_token") {
      return fail(c, "unsupported_grant_type", `Only authorization_code, refresh_token and ${JWT_BEARER_GRANT_TYPE} are supported`);
    }

    if (!client.grantTypes.includes(grantType)) {
      return fail(c, "unauthorized_client", `The client didn't register the ${grantType} grant type`);
    }

    if (grantType === "refresh_token") {
      const refreshToken = field("refresh_token");
      if (!refreshToken) {
        return fail(c, "invalid_request", "The request has no refresh_token");
      }

      const result = await rotateRefreshToken(refreshToken, client.id, resources);
      if (result.type === "invalid_target") {
        return fail(c, "invalid_target", "The resource wasn't part of the authorization request");
      }

      if (result.type === "reused") {
        await audit(c, {
          action: "revoke_access",
          // The user whose grant it was, not necessarily who presented the token
          metadata: { clientId: client.id, teamIds: result.teamIds, userId: result.grant.userId },
          objectId: result.grant.id,
          objectType: "core.oauth_grant",
          reasonCode: "refresh_token_reused",
          subsystem: "core.oauth",
        });
      }

      if (result.type !== "rotated") {
        return fail(c, "invalid_grant", "The refresh token is invalid, expired or revoked");
      }

      return tokenResponse(c, result.tokens, await listGrantPermissionIds(result.grant.id));
    }

    const code = field("code");
    const codeVerifier = field("code_verifier");
    if (!code || !codeVerifier) {
      return fail(c, "invalid_request", "The request needs a code and a code_verifier");
    }

    // Redeemed before any check, so a code can't be tried twice
    const redemption = await redeemAuthorizationCode(code);
    if (redemption.type === "invalid") {
      return fail(c, "invalid_grant", "The code is invalid, expired or already used");
    }

    const { authorization } = redemption;
    const error = codeRequestError(authorization, { clientId: client.id, codeVerifier, redirectUri: field("redirect_uri") });
    // Only a replay that would otherwise have passed revokes what the code gave, so
    // whoever merely saw a used code can't end the grant with it (OAuth 2.1 in
    // draft-ietf-oauth-v2-1-17, section 7.5.3)
    if (redemption.type === "reused") {
      if (!error) {
        await deleteReusedCodeGrant(c, await markAuthorizationCodeReused(authorization));
      }

      return fail(c, "invalid_grant", "The code is invalid, expired or already used");
    }

    if (error) {
      return fail(c, "invalid_grant", error);
    }

    // A token can be narrowed to the resources the user authorized, never widened (RFC 8707, section 2.2)
    if (!resources.every((resource) => authorization.resources.includes(resource))) {
      return fail(c, "invalid_target", "The resource wasn't part of the authorization request");
    }

    let grant: OAuthGrant;
    let permissionIdsByTeam: Map<string, string[]>;
    try {
      ({ grant, permissionIdsByTeam } = await createGrant({
        client,
        permissionIds: authorization.permissionIds,
        teamIds: authorization.teamIds,
        userId: authorization.userId,
      }));
    } catch (error) {
      // The user's access changed since the consent
      if (error instanceof OAuthGrantError) {
        return fail(c, "invalid_grant", error.message);
      }

      throw error;
    }
    // The code was presented again while the grant was being made
    if (!(await recordAuthorizationCodeGrant(authorization, grant.id))) {
      await deleteReusedCodeGrant(c, grant.id);

      return fail(c, "invalid_grant", "The code is invalid, expired or already used");
    }

    const tokens = await issueTokens({
      grantId: grant.id,
      refreshTokenResources: authorization.resources,
      resources: resources.length > 0 ? resources : authorization.resources,
      withRefreshToken: client.grantTypes.includes("refresh_token"),
    });
    // The code was presented again while the tokens were being issued
    if (!tokens) {
      return fail(c, "invalid_grant", "The code is invalid, expired or already used");
    }

    await audit(c, {
      action: "create",
      actorUserId: authorization.userId,
      objectId: grant.id,
      objectType: "core.oauth_grant",
      subsystem: "core.oauth",
      teamId: authorization.teamIds.length === 1 ? authorization.teamIds[0] : null,
    });

    return tokenResponse(c, tokens, permissionIdsByTeam);
  }
);

export type OAuthToken = typeof _token;

export default server;
