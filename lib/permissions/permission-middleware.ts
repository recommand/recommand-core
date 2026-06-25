import { createMiddleware } from "hono/factory";
import type { AuthenticatedUserContext } from "../auth-middleware";
import { actionFailure } from "@recommand/lib/utils";
import { hasGlobalPermission, hasPermission } from "@core/data/permissions";
import { verifySession } from "../session";
import { audit } from "@core/lib/audit";

export function requirePermission(permissionId: string) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    const user = c.var.user;
    if (!user) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.permission",
        objectId: permissionId,
        reasonCode: "unauthenticated",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }
    const teamId = c.get("team")?.id;
    if (!teamId) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.permission",
        objectId: permissionId,
        reasonCode: "missing_team",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    if (!(await hasPermission(user.id, teamId, permissionId))) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.permission",
        objectId: permissionId,
        teamId,
        reasonCode: "missing_permission",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    await next();
  });
}

export function requireGlobalPermission(permissionId: string) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    const session = await verifySession(c);
    if (!session?.userId) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.global_permission",
        objectId: permissionId,
        reasonCode: "unauthenticated",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    const user = c.var.user;
    if (!user) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.global_permission",
        objectId: permissionId,
        reasonCode: "unauthenticated",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    if (!(await hasGlobalPermission(user.id, permissionId))) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.global_permission",
        objectId: permissionId,
        reasonCode: "missing_permission",
      });
      return c.json(actionFailure("Unauthorized"), 401);
    }

    await next();
  });
}
