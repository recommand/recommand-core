import { createMiddleware } from "hono/factory";
import type { AuthenticatedUserContext } from "../auth-middleware";
import { actionFailure } from "@recommand/lib/utils";
import { hasGlobalPermission } from "@core/data/permissions";
import {
  hasPrincipalPermission,
  type ActorPrincipal,
} from "@core/data/principal-permissions";
import { verifySession } from "../session";
import { audit } from "@core/lib/audit";

function getActor(c: {
  var: AuthenticatedUserContext["Variables"];
  get: (key: string) => unknown;
}): ActorPrincipal | null {
  const service = c.get("service") as { id: string } | null | undefined;
  if (service?.id) {
    return { type: "service", serviceId: service.id };
  }

  const installation = c.get("installation") as
    | { id: string; teamId: string }
    | null
    | undefined;
  if (installation?.id) {
    return { type: "installation", installationId: installation.id };
  }

  const apiKey = c.get("apiKey") as { id: string } | null | undefined;
  const user = c.var.user;
  if (apiKey?.id && user?.id) {
    return {
      type: "api_key",
      apiKeyId: apiKey.id,
      ownerUserId: user.id,
    };
  }

  if (user?.id) {
    return { type: "user", userId: user.id };
  }

  return null;
}

export function requirePermission(permissionId: string) {
  return createMiddleware<AuthenticatedUserContext>(async (c, next) => {
    const actor = getActor(c);
    if (!actor) {
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

    if (!(await hasPrincipalPermission(actor, teamId, permissionId))) {
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
