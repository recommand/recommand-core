import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { verifySession, type SessionVerificationExtension } from "./session";
import { actionFailure } from "@recommand/lib/utils";
import { getTeam, isMember, type Team } from "@core/data/teams";

export type AuthenticatedUserContext = {
  Variables: {
    user: {
      id: string;
      isAdmin: boolean;
    };
    team: Team | null;
    teamId: string | null;
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
      return c.json(actionFailure("Unauthorized"), 401);
    }

    // Fetch user data
    const user: { id: string; isAdmin: boolean } | null = c.get("user");
    if (!user?.isAdmin) {
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

export function requireTeamAccess(options: TeamAccessOptions = {}) {
  return createMiddleware<AuthenticatedUserContext & AuthenticatedTeamContext>(
    async (c, next) => {
      // Verify user's session
      const session = await verifySession(c, options.extensions);
      if(!session) {
        return c.json(actionFailure("Unauthorized"), 401);
      }

      const teamIdFromRequest: string | undefined = options.getTeamId ? options.getTeamId(c) : c.req.param(options.param ?? "teamId");
      let teamId: string | null = c.get("teamId");
      if (!teamId) {
        if (!teamIdFromRequest) {
          return c.json(actionFailure("Team ID is required"), 400);
        }

        // Get user from context
        const user: { id: string; isAdmin: boolean } | null = c.get("user");
        if (!user?.id) {
          return c.json(actionFailure("Unauthorized"), 401);
        }

        // If the user is not authenticated via an API key, ensure they are a member of the team
        // Admins bypass this check and can access any team
        if (!user.isAdmin && !(await isMember(user.id, teamIdFromRequest))) {
          return c.json(actionFailure("Unauthorized"), 401);
        }

        teamId = teamIdFromRequest;
      }

      if (!teamId) {
        return c.json(actionFailure("Team ID is required"), 400);
      }

      if (teamIdFromRequest && teamIdFromRequest !== teamId && c.var.user?.isAdmin !== true) {
        return c.json(actionFailure("Unauthorized: provided teamId does not match API key's teamId"), 401);
      }

      if(c.var.user?.isAdmin === true && teamIdFromRequest && teamIdFromRequest !== teamId) {
        // If the user is an admin, allow them to access the team even if the provided teamId does not match the API key's teamId
        teamId = teamIdFromRequest;
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
