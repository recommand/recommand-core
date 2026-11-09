import { fromUnixTime } from "date-fns";
import type { Context } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { jwtVerifyClientSignedJWT } from "@core/data/oauth";
import { recordAuthorizationCodeGrant, redeemAuthorizationCode } from "@core/data/oauth-authorization-codes";
import { findRequestClient } from "@core/data/oauth-clients";
import {
  createGrant,
  deleteGrant,
  listGrantPermissionIds,
  OAuthGrantError,
  prepareAssertionGrant,
  type OAuthGrant,
} from "@core/data/oauth-grants";
import type { IssuedTokens } from "@core/data/oauth-tokens";
import { issueTokens, rotateRefreshToken } from "@core/data/oauth-tokens";
import { getTeam } from "@core/data/teams";
import { audit } from "@core/lib/audit";
import { JWT_BEARER_GRANT_TYPE } from "@core/lib/oauth/jwt-bearer";
import { verifyS256CodeChallenge } from "@core/lib/oauth/pkce";
import { supportedResources } from "@core/lib/oauth/resource";
import { Server } from "@recommand/lib/api";
import { describeOAuthResponse, oauthErrorSchema } from "./responses";

const server = new Server();

const tokenResponseSchema = z
  .object({
    access_token: z.string(),
    expires_in: z.number().int().openapi({ description: "Seconds until the access token expires." }),
    refresh_token: z.string().optional(),
    scope: z.string().openapi({ description: "The granted permissions, separated by spaces." }),
    team_id: z.string().optional().openapi({ description: "The team the grant covers." }),
    team_name: z.string().optional(),
    token_type: z.literal("Bearer"),
  })
  .openapi({ ref: "OAuthTokenResponse" });

type TokenError =
  | "invalid_client"
  | "invalid_grant"
  | "invalid_request"
  | "invalid_target"
  | "unauthorized_client"
  | "unsupported_grant_type";

// Token responses must never be cached (RFC 6749, section 5.1)
const respond = (c: Context, body: Record<string, unknown>, status: 200 | 400 = 200) => {
  c.header("Cache-Control", "no-store");
  return c.json(body, status);
};

const fail = (c: Context, error: TokenError, description: string) =>
  respond(c, { error, error_description: description }, 400);

const tokenResponse = async (c: Context, tokens: IssuedTokens, permissionIdsByTeam: Map<string, string[]>) => {
  const teamIds = [...permissionIdsByTeam.keys()];
  // A grant covers one team for now; with more, the client picks one per request
  const team = teamIds.length === 1 ? await getTeam(teamIds[0]) : null;
  return respond(c, {
    access_token: tokens.accessToken,
    expires_in: tokens.expiresInSeconds,
    ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
    scope: [...new Set([...permissionIdsByTeam.values()].flat())].join(" "),
    ...(team ? { team_id: team.id, team_name: team.name } : {}),
    token_type: "Bearer",
  });
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
 * The JWT bearer grant (RFC 7523, section 2.1): an assertion signed with a key
 * the team registered, naming one of its members, buys an access token without
 * a client. The token carries what the user can delegate there as a member,
 * never admin access, and expires with the assertion, an hour later at most.
 * There is no refresh token: the team signs a new assertion instead.
 */
const exchangeAssertion = async (c: Context, assertion: string | undefined, resources: string[]) => {
  if (!assertion) {
    return fail(c, "invalid_request", "The request has no assertion");
  }
  if (!resources.every((resource) => supportedResources().includes(resource))) {
    return fail(c, "invalid_target", `Tokens can only be issued for ${supportedResources().join(", ")}`);
  }

  // The audience identifies this authorization server: its issuer or its token endpoint (RFC 7523, section 3)
  const issuer = process.env.BASE_URL!;
  const verified = await jwtVerifyClientSignedJWT(assertion, [issuer, `${issuer}/api/core/oauth/token`]);
  if (!verified || verified.payload.exp === undefined) {
    return fail(c, "invalid_grant", "The assertion could not be verified");
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
 */
const _token = server.post(
  "/oauth/token",
  describeRoute({
    description: "Exchange an authorization code, a refresh token or a JWT bearer assertion for tokens (RFC 6749, section 3.2).",
    hide: true,
    operationId: "requestOAuthToken",
    responses: {
      ...describeOAuthResponse(200, "The tokens", tokenResponseSchema),
      ...describeOAuthResponse(400, "The request can't be granted", oauthErrorSchema),
    },
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
      const result = await rotateRefreshToken(refreshToken, client.id);
      if (result.type === "reused") {
        await audit(c, {
          action: "revoke_access",
          objectId: client.id,
          objectType: "core.oauth_client",
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
    if (redemption.type === "reused") {
      await deleteReusedCodeGrant(c, redemption.grantId);
    }
    if (redemption.type !== "redeemed" || redemption.authorization.clientId !== client.id) {
      return fail(c, "invalid_grant", "The code is invalid, expired or already used");
    }
    const { authorization } = redemption;
    if (field("redirect_uri") !== undefined && field("redirect_uri") !== authorization.redirectUri) {
      return fail(c, "invalid_grant", "The redirect_uri differs from the authorization request's");
    }
    if (!verifyS256CodeChallenge(codeVerifier, authorization.codeChallenge)) {
      return fail(c, "invalid_grant", "The code_verifier doesn't match the code_challenge");
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
