import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import type { AuthenticatedUserContext } from "../auth-middleware";
import { refuseOAuthToken } from "../auth-middleware";
import { actionFailure } from "@recommand/lib/utils";
import { hasGlobalPermission } from "@core/data/permissions";
import { hasPrincipalPermission } from "@core/data/principal-permissions";
import { describeErrorResponse } from "@core/lib/api-docs";
import { verifySession } from "../session";
import { audit } from "@core/lib/audit";
import { setBearerChallenge } from "@core/lib/oauth/bearer";
import { getDelegablePermission } from "@core/lib/permissions";

// Optional, since an operation can refuse for other reasons too, such as a team
// without access to its documents, and those answers carry no `code`
export const insufficientPermissionBody = z.object({
  code: z.literal("insufficient_permission").optional().openapi({
    description:
      "Set when the credential lacks the permission the operation requires; the message names it. Other `403` responses of the operation come without it.",
  }),
});

/** Whether the request's user, or the API key or OAuth grant it authenticated with, holds the team permission in its team. */
export const hasRequestPermission = async <E extends AuthenticatedUserContext>(c: Context<E>, permissionId: string) => {
  const user = c.var.user;
  const teamId = c.get("team")?.id;
  if (!user || !teamId) {
    return false;
  }

  const apiKey = c.get("apiKey");
  const grant = c.get("grant");
  const principal = grant
    ? { grantId: grant.id, permissionIds: grant.permissionIdsByTeam.get(teamId) ?? [], type: "oauth_grant" as const, userId: user.id }
    : apiKey
      ? { apiKeyId: apiKey.id, ownerIsAdmin: user.isAdmin, ownerUserId: user.id, teamId: apiKey.teamId, type: "api_key" as const }
      : { type: "user" as const, userId: user.id };

  return hasPrincipalPermission(principal, teamId, permissionId);
};

/**
 * Lets the request through when its user, or the API key or OAuth grant it authenticated with, holds the team permission.
 * The operation's OpenAPI description gains the 403, which names the permission, and lists the permission on
 * its `httpBasic` and `jwt` security requirements, and on `oauth2` when an app can be granted it. A route that sets
 * its own `security` must do so before this middleware, since a later description replaces it.
 */
export function requirePermission(permissionId: string) {
  const middleware = createMiddleware<AuthenticatedUserContext>(async (c, next) => {
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

    if (!(await hasRequestPermission(c, permissionId))) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.permission",
        objectId: permissionId,
        teamId,
        reasonCode: "missing_permission",
      });
      // An OAuth client can ask the user for the missing permission (RFC 6750, section 3.1).
      // No app can ever be granted a permission that isn't delegable, so `insufficient_scope`
      // would only send the client back to a consent that can't help.
      if (c.get("grant")) {
        setBearerChallenge(c, getDelegablePermission(permissionId) ? { error: "insufficient_scope", scope: permissionId } : {});
      }

      return c.json(insufficientPermission(permissionId), 403);
    }

    await next();
  });
  const documentation = describeRoute({
    responses: describeErrorResponse(403, `The credential lacks the \`${permissionId}\` permission, or the team can't use this operation.`, insufficientPermissionBody),
    // OpenAPI 3.1 lets a requirement on any scheme list the roles it needs, so an API
    // key, Basic or JWT, documents the permission the route checks. A getter, since a
    // package can register its permissions after the routes that check them, so
    // whether an app can be granted one is only known once the document is generated
    get security(): Record<string, string[]>[] {
      return [{ httpBasic: [permissionId] }, { jwt: [permissionId] }, ...(getDelegablePermission(permissionId) ? [{ oauth2: [permissionId] }] : [])];
    },
  });

  // The description travels as a symbol property of describeRoute's middleware, which Object.assign copies
  return Object.assign(middleware, documentation);
}

/** The failure envelope for a credential that lacks a permission, with a code clients can act on. */
export const insufficientPermission = (permissionId: string) => ({
  ...actionFailure(`This operation needs the ${permissionId} permission.`),
  code: "insufficient_permission" as const,
});

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

    // No OAuth client can be granted a global permission
    if (c.get("grant")) {
      return refuseOAuthToken(c);
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
