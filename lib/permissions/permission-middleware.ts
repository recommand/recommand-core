import { createMiddleware } from "hono/factory";
import type { AuthenticatedUserContext } from "../auth-middleware";
import { actionFailure } from "@recommand/lib/utils";
import { hasGlobalPermission, hasPermission } from "@core/data/permissions";

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

export function requireGlobalPermission(permissionId: string) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    const user = c.var.user;
    if (!user) {
      return c.json(actionFailure("Unauthorized"), 401);
    }

    if (!(await hasGlobalPermission(user.id, permissionId))) {
      return c.json(actionFailure("Unauthorized"), 401);
    }

    await next();
  });
}