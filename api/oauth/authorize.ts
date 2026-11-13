import type { Context } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { createAuthorizationCode } from "@core/data/oauth-authorization-codes";
import { findClient } from "@core/data/oauth-clients";
import { listMemberTeamPermissionIds } from "@core/data/permissions";
import { getUserTeams } from "@core/data/teams";
import { describeErrorResponse, describeSuccessResponse, describeValidationErrorResponse } from "@core/lib/api-docs";
import { audit } from "@core/lib/audit";
import { requireAuth } from "@core/lib/auth-middleware";
import {
  buildRedirect,
  parseAuthorizationRequest,
  type AuthorizationRequest,
} from "@core/lib/oauth/authorization-request";
import { isLoopbackRedirectUri } from "@core/lib/oauth/redirect-uri";
import { getDelegablePermission } from "@core/lib/permissions";
import { withTranslation } from "@core/lib/translation-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";

const server = new Server();

const parametersSchema = z.object({
  client_id: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  redirect_uri: z.string().optional(),
  // A query has one value as a string, more as an array
  resource: z
    .union([z.string(), z.array(z.string())])
    .transform((resource) => [resource].flat())
    .optional(),
  response_type: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
});

const consentClientSchema = z
  .object({
    host: z.string().nullable().openapi({ description: "The host of the client's metadata document, which identifies it; null for a registered client." }),
    name: z.string().nullable(),
    uri: z.string().nullable().openapi({ description: "The client's home page, as its metadata gives it." }),
  })
  .openapi({ ref: "OAuthConsentClient" });

const consentPermissionSchema = z
  .object({
    delegation: z.enum(["all", "opt_in"]).openapi({ description: "`opt_in` permissions start unticked." }),
    description: z.string().nullable(),
    id: z.string(),
    name: z.string(),
    resource: z.string().nullable(),
  })
  .openapi({ ref: "OAuthConsentPermission" });

const consentTeamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    permissionIds: z.array(z.string()).openapi({ description: "The requested permissions the user holds in this team." }),
  })
  .openapi({ ref: "OAuthConsentTeam" });

const consentSchema = z
  .object({
    client: consentClientSchema,
    isLoopbackRedirect: z.boolean().openapi({ description: "Whether the user returns to a program on their own computer." }),
    permissions: z.array(consentPermissionSchema),
    redirectHost: z.string(),
    teams: z.array(consentTeamSchema),
  })
  .openapi({ ref: "OAuthConsent" });

// Only someone signed in to the web app consents, not an API key
const isSignedInToWebApp = (c: Context) => c.get("authenticationMethod") === "cookie";

// Per team the user is a member of, the requested permissions they hold there
const listTeamChoices = async (userId: string, request: AuthorizationRequest) => {
  const teams = await getUserTeams(userId);
  return Promise.all(
    teams.map(async (team) => {
      const held = new Set(await listMemberTeamPermissionIds(userId, team.id));
      return {
        id: team.id,
        name: team.name,
        permissionIds: request.permissionIds.filter((permissionId) => held.has(permissionId)),
      };
    })
  );
};

const redirectWithError = (result: { description: string; error: string; redirectUri: string; state: string | null }) =>
  buildRedirect(result.redirectUri, {
    error: result.error,
    error_description: result.description,
    iss: process.env.BASE_URL!,
    state: result.state,
  });

const _getAuthorization = server.get(
  "/oauth/authorize",
  describeRoute({
    description: "Check an authorization request and return what the consent screen shows, or where to send the user back to with an error.",
    hide: true,
    operationId: "getOAuthConsent",
    responses: {
      ...describeSuccessResponse("What the consent screen shows, or the redirect for an error", z.object({
        consent: consentSchema.nullable().openapi({ description: "Null when the request can only be answered with an error at `redirectTo`." }),
        redirectTo: z.string().nullable(),
      })),
      ...describeValidationErrorResponse("The request is invalid before its client and redirect URI can be trusted"),
      ...describeErrorResponse(401, "The user isn't signed in to the web app"),
    },
    summary: "Get an OAuth Consent",
    tags: ["OAuth"],
  }),
  requireAuth(),
  withTranslation(),
  zodValidator("query", parametersSchema),
  async (c) => {
    const t = c.get("t");
    if (!isSignedInToWebApp(c)) {
      return c.json(actionFailure({ login: [t`Sign in again to continue`] }), 401);
    }

    const result = await parseAuthorizationRequest(c.req.valid("query"), (clientId) => findClient(clientId));
    if (result.type === "invalid") {
      return c.json(actionFailure({ request: [result.description] }), 400);
    }
    if (result.type === "redirect") {
      return c.json(actionSuccess({ consent: null, redirectTo: redirectWithError(result) }));
    }

    const { request } = result;
    return c.json(
      actionSuccess({
        consent: {
          client: {
            host: URL.canParse(request.client.id) ? new URL(request.client.id).host : null,
            name: request.client.name,
            uri: request.client.clientUri,
          },
          // Any program on the user's computer can listen on a local port and claim to be the client
          isLoopbackRedirect: isLoopbackRedirectUri(request.redirectUri),
          permissions: request.permissionIds.map((permissionId) => {
            const permission = getDelegablePermission(permissionId)!;
            return {
              // `opt_in` permissions start unticked, so the user grants them deliberately
              delegation: permission.delegation ?? "all",
              description: permission.description ?? null,
              id: permission.id,
              name: permission.name,
              resource: permission.resource ?? null,
            };
          }),
          redirectHost: new URL(request.redirectUri).host,
          teams: await listTeamChoices(c.get("user").id, request),
        },
        redirectTo: null,
      })
    );
  }
);

const _decideAuthorization = server.post(
  "/oauth/authorize",
  describeRoute({
    description: "Approve an authorization request with the teams and permissions the user chose, or deny it, and return where to send the user back to.",
    hide: true,
    operationId: "decideOAuthConsent",
    responses: {
      ...describeSuccessResponse("Where to send the user back to, with a code or an error", z.object({ redirectTo: z.string() })),
      ...describeValidationErrorResponse("The request is invalid, or the choice grants nothing"),
      ...describeErrorResponse(401, "The user isn't signed in to the web app"),
    },
    summary: "Decide on an OAuth Consent",
    tags: ["OAuth"],
  }),
  requireAuth(),
  withTranslation(),
  zodValidator(
    "json",
    z.object({
      parameters: parametersSchema,
      // The permissions the user chose, from those the teams offer; absent when the user denies the request
      permissionIds: z.array(z.string()).optional(),
      // The teams the user picked; null when the user denies the request
      teamIds: z.array(z.string().min(1)).nullable(),
    })
  ),
  async (c) => {
    const t = c.get("t");
    if (!isSignedInToWebApp(c)) {
      return c.json(actionFailure({ login: [t`Sign in again to continue`] }), 401);
    }

    const { parameters, permissionIds: chosen, teamIds } = c.req.valid("json");
    const result = await parseAuthorizationRequest(parameters, (clientId) => findClient(clientId));
    if (result.type === "invalid") {
      return c.json(actionFailure({ request: [result.description] }), 400);
    }
    if (result.type === "redirect") {
      return c.json(actionSuccess({ redirectTo: redirectWithError(result) }));
    }

    const { request } = result;
    const userId = c.get("user").id;
    if (teamIds === null) {
      await audit(c, {
        action: "authorize",
        objectId: request.client.id,
        objectType: "core.oauth_client",
        outcome: "denied",
        reasonCode: "user_denied",
        subsystem: "core.oauth",
      });
      return c.json(
        actionSuccess({
          redirectTo: redirectWithError({
            description: "The user denied the request",
            error: "access_denied",
            redirectUri: request.redirectUri,
            state: request.state,
          }),
        })
      );
    }

    if (teamIds.length === 0) {
      return c.json(actionFailure({ teamIds: [t`Choose at least one team`] }), 400);
    }
    const teams = (await listTeamChoices(userId, request)).filter((choice) => teamIds.includes(choice.id));
    if (teams.length < new Set(teamIds).size || teams.some((team) => team.permissionIds.length === 0)) {
      return c.json(actionFailure({ teamIds: [t`Nothing can be granted in this team`] }), 400);
    }
    // Only what the teams offered: what the client asked for and the user holds there. Without
    // a choice, what the consent screen ticks: everything but the `opt_in` permissions. Each
    // team gets the chosen permissions the user holds there.
    const offered = [...new Set(teams.flatMap((team) => team.permissionIds))];
    const ticked = chosen ?? offered.filter((permissionId) => getDelegablePermission(permissionId)?.delegation !== "opt_in");
    const permissionIds = offered.filter((permissionId) => ticked.includes(permissionId));
    const emptyTeam = teams.find((team) => !team.permissionIds.some((permissionId) => permissionIds.includes(permissionId)));
    if (permissionIds.length === 0 || emptyTeam) {
      return c.json(
        actionFailure({
          permissionIds: [emptyTeam && permissionIds.length > 0 ? t`Choose a permission for ${emptyTeam.name}` : t`Choose at least one permission`],
        }),
        400
      );
    }

    const code = await createAuthorizationCode({
      clientId: request.client.id,
      codeChallenge: request.codeChallenge,
      permissionIds,
      redirectUri: request.redirectUri,
      resources: request.resources,
      teamIds: teams.map((team) => team.id),
      userId,
    });
    await Promise.all(
      teams.map((team) =>
        audit(c, {
          action: "grant_access",
          metadata: { permissionIds: team.permissionIds.filter((permissionId) => permissionIds.includes(permissionId)) },
          objectId: request.client.id,
          objectType: "core.oauth_client",
          subsystem: "core.oauth",
          teamId: team.id,
        })
      )
    );

    return c.json(
      actionSuccess({
        redirectTo: buildRedirect(request.redirectUri, { code, iss: process.env.BASE_URL!, state: request.state }),
      })
    );
  }
);

export type OAuthAuthorize = typeof _getAuthorization | typeof _decideAuthorization;

export default server;
