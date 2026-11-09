import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { describeRoute } from "hono-openapi";
import { verifySession, type AuthenticationMethod, type SessionVerificationExtension } from "./session";
import { actionFailure } from "@recommand/lib/utils";
import { z } from "zod";
import "zod-openapi/extend";
import { getTeam, isMember, type Team } from "@core/data/teams";
import { describeErrorResponse } from "@core/lib/api-docs";
import { audit } from "@core/lib/audit";
import type { RequestGrant } from "@core/lib/oauth/bearer";
import { presentsBearerToken, setBearerChallenge } from "@core/lib/oauth/bearer";

export type AuthenticatedUserContext = {
  Variables: {
    user: {
      id: string;
      isAdmin: boolean;
    };
    team: Team | null;
    teamId: string | null;
    apiKey: {
      id: string;
      teamId: string;
    } | null;
    authenticationMethod: AuthenticationMethod;
    // Set for an OAuth access token: the grant it was issued for
    grant: RequestGrant | null;
  };
};

export type AuthenticatedTeamContext = {
  Variables: {
    team: Team;
  };
};

export type AuthOptions = {
  /** Only a signed-in browser session passes, not an API key: for what a user manages about their own account. */
  browserSessionOnly?: boolean;
  extensions?: SessionVerificationExtension[];
};

export function requireAuth(options: AuthOptions = {}) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    // Verify user's session
    const session = await verifySession(c, options.extensions);
    // Fetch user data
    if (!session?.userId) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.auth",
        outcome: "denied",
        objectType: "core.route",
        objectId: c.req.path,
        reasonCode: "unauthenticated",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    if (c.get("grant")) {
      return refuseOAuthToken(c);
    }

    if (options.browserSessionOnly && c.get("authenticationMethod") !== "cookie") {
      await audit(c, {
        action: "authorize",
        objectId: c.req.path,
        objectType: "core.route",
        outcome: "denied",
        reasonCode: "browser_session_required",
        subsystem: "core.auth",
      });

      return c.json(actionFailure("Only a signed-in browser session can use this endpoint"), 403);
    }

    // Successfully authenticated, continue to next middleware
    await next();
  });
}

export function requireAdmin() {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    // Verify user's session
    const session = await verifySession(c);
    if (!session?.userId) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.auth",
        outcome: "denied",
        objectType: "core.route",
        objectId: c.req.path,
        reasonCode: "unauthenticated",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    // An OAuth token never carries admin access
    if (c.get("grant")) {
      return refuseOAuthToken(c);
    }

    // Fetch user data
    const user: { id: string; isAdmin: boolean } | null = c.get("user");
    if (!user?.isAdmin) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.auth",
        outcome: "denied",
        objectType: "core.route",
        objectId: c.req.path,
        reasonCode: "not_admin",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    // Successfully authenticated, continue to next middleware
    await next();
  });
}

/**
 * Answers a request made with an OAuth access token on a route that isn't open
 * to OAuth clients, such as one that acts for the user rather than a team.
 */
export const refuseOAuthToken = async (c: Context) => {
  await audit(c, {
    action: "authorize",
    objectId: c.req.path,
    objectType: "core.route",
    outcome: "denied",
    reasonCode: "oauth_token_refused",
    subsystem: "core.auth",
  });

  return c.json(actionFailure("This endpoint can't be used with an OAuth access token"), 403);
};

export type TeamAccessOptions = {
  param?: string;
  getTeamId?: (c: Context) => string;
  /**
   * The team of what the request names, such as a company, for an OAuth grant
   * when the path has no team: a grant can cover several teams.
   */
  findTeamId?: (c: Context) => Promise<string | null>;
  extensions?: SessionVerificationExtension[];
  /**
   * Documents the `Recommand-Team` header, for a route whose path names neither a
   * team nor something of one: there, an OAuth grant that covers several teams has
   * to send it. Every route accepts the header either way.
   */
  documentTeamHeader?: boolean;
};

/**
 * The request header that names the team a request acts in, where its path names
 * neither a team nor something of one, such as a company. Without an `X-` prefix,
 * as RFC 6648 recommends.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6648#section-3
 */
export const TEAM_HEADER = "Recommand-Team";

/** The team the `Recommand-Team` header names, if the request sends one. */
export const getTeamHeader = (c: Context): string | null => c.req.header(TEAM_HEADER)?.trim() || null;

/** Refuses a `Recommand-Team` header that names another team than the request does: it's never applied. */
export const refuseTeamMismatch = (c: Context) =>
  c.json({ ...actionFailure(`The ${TEAM_HEADER} header names another team than the request`), code: "team_mismatch" as const }, 400);

const teamHeaderErrorBody = z.object({
  code: z.enum(["team_mismatch", "team_required"]).openapi({
    description:
      "`team_required` when an OAuth grant that covers several teams names no team; `team_mismatch` when the header names another team than the request does.",
    ref: "TeamSelectionErrorCode",
  }).optional(),
});

/**
 * Documents the `Recommand-Team` header on every route `middleware` guards, with the answers it
 * can lead to. A route that documents its own `400` or `404` keeps its description.
 * `describeRoute()` returns a middleware that carries its description as a symbol
 * property, which `Object.assign` copies onto `middleware`.
 */
export const withTeamHeader = <M extends object>(middleware: M): M =>
  Object.assign(
    middleware,
    describeRoute({
      parameters: [
        {
          description:
            "The team to act in. An OAuth grant that covers several teams has to name one, or gets `400` with `team_required`; a team the grant doesn't cover answers `404`. A credential bound to one team, such as an API key, may only name its own.",
          example: "team_01JQZ8X0M4T7RB6K9V2NDHW3PA",
          in: "header",
          name: TEAM_HEADER,
          required: false,
          schema: { type: "string" },
        },
      ],
      responses: {
        ...describeErrorResponse(400, "The request names no team, or names two different ones", teamHeaderErrorBody),
        ...describeErrorResponse(404, "The team the request names doesn't exist, or the credential can't act in it"),
      },
    })
  );

export type TeamAccessDenialReason = "not_in_grant" | "not_team_member" | "team_id_mismatch" | "unauthenticated";

export type TeamAccess = { allowed: true } | { allowed: false; reason: TeamAccessDenialReason };

/**
 * Decides whether a verified session may act on a team. An OAuth access token
 * reaches the teams of its grant while its user is still a member, never through
 * admin access. A credential bound to a team (an API key or an integration
 * token) reaches only that team, any other session only the teams its user is a
 * member of. Admins reach every team.
 */
export const checkTeamAccess = async (c: Context, teamId: string): Promise<TeamAccess> => {
  const user: { id: string | null; isAdmin: boolean } | null = c.get("user");
  const grant: RequestGrant | null = c.get("grant") ?? null;
  if (grant) {
    if (!user?.id || !(await isMember(user.id, teamId))) {
      return { allowed: false, reason: "not_team_member" };
    }

    // A team is part of the grant when the grant holds a permission there
    return (grant.permissionIdsByTeam.get(teamId) ?? []).length > 0 ? { allowed: true } : { allowed: false, reason: "not_in_grant" };
  }

  if (user?.isAdmin) {
    return { allowed: true };
  }

  const credentialTeamId: string | null = c.get("teamId");
  if (credentialTeamId) {
    return credentialTeamId === teamId ? { allowed: true } : { allowed: false, reason: "team_id_mismatch" };
  }

  if (!user?.id) {
    return { allowed: false, reason: "unauthenticated" };
  }

  return (await isMember(user.id, teamId)) ? { allowed: true } : { allowed: false, reason: "not_team_member" };
};

export function requireTeamAccess(options: TeamAccessOptions = {}) {
  const middleware = createMiddleware<AuthenticatedUserContext & AuthenticatedTeamContext>(
    async (c, next) => {
      // Verify user's session
      const session = await verifySession(c, options.extensions);
      if(!session) {
        await audit(c, {
          action: "authorize",
          subsystem: "core.team_access",
          outcome: "denied",
          objectType: "core.route",
          objectId: c.req.path,
          reasonCode: "unauthenticated",
        });
        // Tells a client whose bearer token didn't authenticate it that the token is invalid
        setBearerChallenge(c, presentsBearerToken(c) ? { error: "invalid_token" } : {});

        return c.json(actionFailure("Unauthorized"), 401);
      }

      // Which team a request acts in can depend on `Recommand-Team`, so caches keep the answers apart
      c.header("Vary", TEAM_HEADER, { append: true });
      const teamIdFromRequest: string | undefined = options.getTeamId ? options.getTeamId(c) : c.req.param(options.param ?? "teamId");
      const credentialTeamId: string | null = c.get("teamId");
      const grant: RequestGrant | null = c.get("grant") ?? null;
      const grantTeamIds = grant ? [...grant.permissionIdsByTeam.keys()] : [];
      const headerTeamId = getTeamHeader(c);
      const namedTeamId = teamIdFromRequest || (grant && !credentialTeamId ? await options.findTeamId?.(c) : null) || null;
      // A credential bound to a team doesn't reveal whether another team exists
      if (headerTeamId && credentialTeamId && headerTeamId !== credentialTeamId) {
        return c.json(actionFailure("Team not found"), 404);
      }

      // A team-bound credential addresses its own team unless the request names
      // one. A grant addresses the team of what the request names, the team the
      // header names, or its only team.
      const teamId =
        namedTeamId || headerTeamId || credentialTeamId || (grantTeamIds.length === 1 ? grantTeamIds[0] : null);
      if (!teamId) {
        if (grantTeamIds.length > 1) {
          return c.json(
            {
              ...actionFailure(`This OAuth grant covers several teams, so the request has to name one in the ${TEAM_HEADER} header`),
              code: "team_required" as const,
            },
            400
          );
        }

        return c.json(actionFailure("Team ID is required"), 400);
      }

      const access = await checkTeamAccess(c, teamId);
      if (!access.allowed) {
        await audit(c, {
          action: "authorize",
          subsystem: "core.team_access",
          outcome: "denied",
          objectType: "core.team",
          objectId: teamId,
          // A grant has no team of its own, and the team it asked for isn't one it reaches
          ...(access.reason !== "unauthenticated" && !grant ? { teamId: credentialTeamId ?? teamId } : {}),
          reasonCode: access.reason,
        });
        // A team the header names outside the grant answers as one that doesn't exist
        if (grant && teamId === headerTeamId && !namedTeamId) {
          return c.json(actionFailure("Team not found"), 404);
        }

        // The user can grant the client a team they're a member of on the consent screen,
        // but not another team, so only the first asks for it
        if (grant) {
          setBearerChallenge(c, access.reason === "not_in_grant" ? { error: "insufficient_scope" } : {});

          return c.json(actionFailure("This team isn't part of the OAuth grant"), 403);
        }

        return c.json(
          actionFailure(
            access.reason === "team_id_mismatch"
              ? "Unauthorized: provided teamId does not match API key's teamId"
              : "Unauthorized"
          ),
          401
        );
      }

      // Only checked once the request may act in the team it names, so the answer
      // can't tell anyone else whether that team holds what the path names
      if (headerTeamId && namedTeamId && headerTeamId !== namedTeamId) {
        return refuseTeamMismatch(c);
      }

      const team = await getTeam(teamId);
      if (!team) {
        return c.json(actionFailure("Team not found"), 404);
      }
      c.set("team", team);

      await next();
    }
  );

  return options.documentTeamHeader ? withTeamHeader(middleware) : middleware;
}
