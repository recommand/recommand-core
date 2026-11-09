import type { AuthorizationCode } from "@core/data/oauth-authorization-codes";
import { markAuthorizationCodeReused, recordAuthorizationCodeGrant, redeemAuthorizationCode } from "@core/data/oauth-authorization-codes";
import { findRequestClient } from "@core/data/oauth-clients";
import type { OAuthGrant } from "@core/data/oauth-grants";
import { createGrant, deleteGrant, listGrantPermissionIds, OAuthGrantError } from "@core/data/oauth-grants";
import type { IssuedTokens } from "@core/data/oauth-tokens";
import { ACCESS_TOKEN_LIFETIME_SECONDS, issueTokens, rotateRefreshToken } from "@core/data/oauth-tokens";
import { getTeam } from "@core/data/teams";
import { audit } from "@core/lib/audit";
import { verifyS256CodeChallenge } from "@core/lib/oauth/pkce";
import { hasSigningKey } from "@core/lib/signing-keys";
import { Server } from "@recommand/lib/api";
import { zodResolver } from "@recommand/lib/zod-validator";
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
    client_id: z.string().optional().openapi({ description: "For `authorization_code` and `refresh_token`: the client." }),
    code: z.string().optional().openapi({ description: "For `authorization_code`: the code the authorization endpoint returned." }),
    code_verifier: z.string().optional().openapi({ description: "For `authorization_code`: the PKCE verifier of the code's challenge." }),
    grant_type: z.enum(["authorization_code", "refresh_token"]),
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
    expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
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

/**
 * The token endpoint (RFC 6749, section 3.2) for clients of this authorization
 * server: it exchanges authorization codes and refresh tokens. The JWT bearer
 * flow for API keys keeps its own endpoint at `/oauth2/token`.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.2
 */
const _token = server.post(
  "/oauth/token",
  describeRoute({
    description: "Exchange an authorization code or a refresh token for tokens (RFC 6749, section 3.2).",
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

    const client = await findRequestClient(field("client_id"));
    if (!client) {
      return fail(c, "invalid_client", "The client is unknown or disabled");
    }

    const grantType = field("grant_type");
    if (grantType !== "authorization_code" && grantType !== "refresh_token") {
      return fail(c, "unsupported_grant_type", "Only authorization_code and refresh_token are supported");
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
