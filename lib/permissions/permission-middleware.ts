import { createMiddleware } from "hono/factory";
import type { AuthenticatedUserContext } from "../auth-middleware";
import { actionFailure } from "@recommand/lib/utils";
import { hasPermission, hasPermissionInAnyTeam } from "@core/data/permissions";

export function requirePermission(permissionId: string) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    const user = c.var.user;
    if (!user) {
      return c.json(actionFailure("Unauthorized"), 401);
    }
    const teamId = c.get("team")?.id;
    if (!teamId) {
      return c.json(actionFailure("Unauthorized"), 401);
    }

    if (!(await hasPermission(user.id, teamId, permissionId))) {
      return c.json(actionFailure("Unauthorized"), 401);
    }

    await next();
  });
}

/**
 * Middleware that checks if the authenticated user has the given permission
 * in any of their teams. Useful for team-agnostic endpoints where no specific
 * team context is required. Admins bypass the check.
 */
export function requireTeamAgnosticPermission(permissionId: string) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    const user = c.var.user;
    if (!user) {
      return c.json(actionFailure("Unauthorized"), 401);
    }

    if (!(await hasPermissionInAnyTeam(user.id, permissionId))) {
      return c.json(actionFailure("Unauthorized"), 401);
    }

    await next();
  });
}