import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { verifySession, type AuthenticationMethod, type SessionVerificationExtension } from "./session";
import { actionFailure } from "@recommand/lib/utils";
import { getTeam, isMember, type Team } from "@core/data/teams";
import { audit } from "@core/lib/audit";

export type AuthenticatedUserContext = {
  Variables: {
    user: {
      id: string;
      isAdmin: boolean;
    };
    team: Team | null;
    teamId: string | null;
    authenticationMethod: AuthenticationMethod;
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

export type TeamAccessOptions = {
  param?: string;
  getTeamId?: (c: Context) => string;
  extensions?: SessionVerificationExtension[];
};

export type TeamAccessDenialReason = "not_team_member" | "team_id_mismatch" | "unauthenticated";

export type TeamAccess = { allowed: true } | { allowed: false; reason: TeamAccessDenialReason };

/**
 * Decides whether a verified session may act on a team. A credential bound to a
 * team (an API key or an integration token) reaches only that team, any other
 * session only the teams its user is a member of. Admins reach every team.
 */
export async function checkTeamAccess(c: Context, teamId: string): Promise<TeamAccess> {
  const user: { id: string | null; isAdmin: boolean } | null = c.get("user");
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
}

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
        return c.json(actionFailure("Unauthorized"), 401);
      }

      const teamIdFromRequest: string | undefined = options.getTeamId ? options.getTeamId(c) : c.req.param(options.param ?? "teamId");
      const credentialTeamId: string | null = c.get("teamId");
      // A team-bound credential addresses its own team unless the request names one
      const teamId = teamIdFromRequest || credentialTeamId;
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
