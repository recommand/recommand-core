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

// Optional, since an operation can refuse for other reasons too, such as a team
// without access to its documents, and those answers carry no `code`
export const insufficientPermissionBody = z.object({
  code: z.literal("insufficient_permission").optional().openapi({
    description:
      "Set when the credential lacks the permission the operation requires; the message names it. Other `403` responses of the operation come without it.",
  }),
});

/**
 * Lets the request through when its user, or the API key or OAuth grant it authenticated with, holds the team permission.
 * The operation's OpenAPI description gains the 403, which names the permission, and lists the permission on
 * its `httpBasic` and `jwt` security requirements. A route that sets its own `security` must do so before this
 * middleware, since a later description replaces it.
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

    const apiKey = c.get("apiKey");
    const grant = c.get("grant");
    const principal = grant
      ? {
          grantId: grant.id,
          permissionIds: grant.permissionIdsByTeam.get(teamId) ?? [],
          type: "oauth_grant" as const,
          userId: user.id,
        }
      : apiKey
        ? { apiKeyId: apiKey.id, ownerUserId: user.id, type: "api_key" as const }
        : { type: "user" as const, userId: user.id };
    if (!(await hasPrincipalPermission(principal, teamId, permissionId))) {
      await audit(c, {
        action: "authorize",
        subsystem: "core.permissions",
        outcome: "denied",
        objectType: "core.permission",
        objectId: permissionId,
        teamId,
        reasonCode: "missing_permission",
      });
      // An OAuth client can ask the user for the missing permission (RFC 6750, section 3.1)
      if (grant) {
        setBearerChallenge(c, { error: "insufficient_scope", scope: permissionId });
      }
      return c.json(insufficientPermission(permissionId), 403);
    }

    await next();
  });
  const documentation = describeRoute({
    responses: describeErrorResponse(403, `The credential lacks the \`${permissionId}\` permission.`, insufficientPermissionBody),
    // OpenAPI 3.1 lets a requirement on any scheme list the roles it needs, so an API
    // key, Basic or JWT, documents the permission the route checks
    security: [{ httpBasic: [permissionId] }, { jwt: [permissionId] }],
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
