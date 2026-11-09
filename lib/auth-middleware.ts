import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { verifySession, type AuthenticationMethod, type SessionVerificationExtension } from "./session";
import { actionFailure } from "@recommand/lib/utils";
import { getTeam, isMember, type Team } from "@core/data/teams";
import { audit } from "@core/lib/audit";
import type { RequestGrant } from "@core/lib/oauth/bearer";
import { presentsOAuthAccessToken, setBearerChallenge } from "@core/lib/oauth/bearer";

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
  extensions?: SessionVerificationExtension[];
};

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
    // A team is part of the grant when the grant holds a permission there
    const reachable =
      !!user?.id && (grant.permissionIdsByTeam.get(teamId) ?? []).length > 0 && (await isMember(user.id, teamId));
    return reachable ? { allowed: true } : { allowed: false, reason: "not_in_grant" };
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
  return createMiddleware<AuthenticatedUserContext & AuthenticatedTeamContext>(
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
        // Tells an OAuth client which permission to ask for, or that its token is no longer valid
        setBearerChallenge(c, presentsOAuthAccessToken(c) ? { error: "invalid_token" } : {});
        return c.json(actionFailure("Unauthorized"), 401);
      }

      const teamIdFromRequest: string | undefined = options.getTeamId ? options.getTeamId(c) : c.req.param(options.param ?? "teamId");
      const credentialTeamId: string | null = c.get("teamId");
      const grant: RequestGrant | null = c.get("grant") ?? null;
      const grantTeamIds = grant ? [...grant.permissionIdsByTeam.keys()] : [];
      // A team-bound credential, or a grant for one team, addresses its own team
      // unless the request names one
      const teamId = teamIdFromRequest || credentialTeamId || (grantTeamIds.length === 1 ? grantTeamIds[0] : null);
      if (!teamId) {
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
          ...(access.reason !== "unauthenticated" && { teamId: credentialTeamId ?? teamId }),
          reasonCode: access.reason,
        });
        // The user can grant the client this team on the consent screen
        if (access.reason === "not_in_grant") {
          setBearerChallenge(c, { error: "insufficient_scope" });
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

      const team = await getTeam(teamId);
      if (!team) {
        return c.json(actionFailure("Team not found"), 404);
      }
      c.set("team", team);

      await next();
    }
  );
}
