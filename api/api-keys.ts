import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { createApiKey, deleteApiKey, getApiKeys, getApiKeyCreationStatus, setApiKeyPermissions } from "@core/data/api-keys";
import {
  InvalidPermissionScopeError,
  NotAuthorizedError,
  PermissionNotRegisteredError,
} from "@core/data/permissions";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { describeErrorResponse, describeSuccessResponse } from "@core/lib/api-docs";
import { audit } from "@core/lib/audit";
import { insufficientPermissionBody, requirePermission } from "@core/lib/permissions/permission-middleware";

const server = new Server();

/** The status for permissions that can't be put on a key, or null for any other error. */
const permissionErrorStatus = (error: unknown) => {
  if (error instanceof PermissionNotRegisteredError || error instanceof InvalidPermissionScopeError) {
    return 400;
  }
  if (error instanceof NotAuthorizedError) {
    return 403;
  }
  return null;
};

const permissionIdsSchema = z.array(z.string()).openapi({ description: "The ids of the team permissions the key holds." });

const apiKeyPermissionsSchema = z
  .object({
    id: z.string().openapi({ description: "The API key's id." }),
    permissionIds: permissionIdsSchema,
  })
  .openapi({ ref: "ApiKeyPermissions" });

const _getApiKeys = server.get(
  "/:teamId/api-keys",
  requireTeamAccess(),
  requirePermission("core.api_keys.read"),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  async (c) => {
    try {
      const apiKeys = await getApiKeys(c.var.user.id, c.var.team.id);
      return c.json(
        actionSuccess({
          apiKeys,
        })
      );
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

const _createApiKey = server.post(
  "/:teamId/api-keys",
  requireTeamAccess(),
  requirePermission("core.api_keys.write"),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  zodValidator(
    "json",
    z.object({
      name: z.string(),
      type: z.enum(["basic", "jwt"]).default("basic"),
      expiresInSeconds: z.number().min(1).optional().default(24 * 60 * 60), // 24 hours in seconds
      permissionIds: z.array(z.string()).optional(),
    })
  ),
  async (c) => {
    try {
      const apiKey = await createApiKey({
        user: c.var.user,
        teamId: c.var.team.id,
        name: c.req.valid("json").name,
        type: c.req.valid("json").type,
        expiresInSeconds: c.req.valid("json").expiresInSeconds,
        permissionIds: c.req.valid("json").permissionIds,
        actorApiKeyId: c.get("apiKey")?.id,
      });
      await audit(c, {
        action: "create",
        subsystem: "core.api_keys",
        objectType: "core.api_key",
        objectId: apiKey.id,
        after: {
          name: apiKey.name,
          type: apiKey.type,
          expiresAt: apiKey.expiresAt?.toISOString() ?? null,
        },
      });
      return c.json(actionSuccess({ apiKey }));
    } catch (error) {
      const status = permissionErrorStatus(error);
      if (status) {
        return c.json(actionFailure(error as Error), status);
      }
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

const _isApiKeyCreationEnabled = server.get(
  "/:teamId/api-keys/is-creation-permitted",
  requireTeamAccess(),
  requirePermission("core.api_keys.read"),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  async (c) => {
    const status = await getApiKeyCreationStatus(c.var.team.id);
    return c.json(actionSuccess({
      isPermitted: status.permitted,
      reason: status.permitted ? null : status.reason,
    }))
  }
);

const _setApiKeyPermissions = server.put(
  "/:teamId/api-keys/:apiKeyId/permissions",
  requireTeamAccess(),
  requirePermission("core.api_keys.write"),
  describeRoute({
    description: "Replace the team permissions of an API key. The key's owner must hold each of them; changing someone else's key also needs `core.team.manage`.",
    hide: true,
    operationId: "setApiKeyPermissions",
    responses: {
      ...describeSuccessResponse("The key's permissions were replaced", z.object({ apiKey: apiKeyPermissionsSchema })),
      ...describeErrorResponse(400, "A permission is unknown or not a team permission"),
      // Replaces the 403 `requirePermission` documents, so it names that cause too
      ...describeErrorResponse(
        403,
        "The credential lacks the `core.api_keys.write` permission, or can't give the key one of these permissions.",
        insufficientPermissionBody
      ),
      ...describeErrorResponse(404, "The API key was not found"),
      ...describeErrorResponse(500, "Failed to set the permissions"),
    },
    summary: "Set API Key Permissions",
    tags: ["API Keys"],
  }),
  zodValidator(
    "param",
    z.object({
      apiKeyId: z.string(),
      teamId: z.string(),
    })
  ),
  zodValidator(
    "json",
    z.object({
      permissionIds: z.array(z.string()),
    })
  ),
  async (c) => {
    try {
      const updated = await setApiKeyPermissions({
        actorApiKeyId: c.get("apiKey")?.id,
        actorUserId: c.var.user.id,
        apiKeyId: c.req.valid("param").apiKeyId,
        permissionIds: c.req.valid("json").permissionIds,
        teamId: c.var.team.id,
      });
      if (!updated) {
        return c.json(actionFailure("API key not found"), 404);
      }
      await audit(c, {
        action: "update",
        after: {
          permissionIds: updated.permissionIds,
        },
        objectId: updated.id,
        objectType: "core.api_key",
        subsystem: "core.api_keys",
      });
      return c.json(actionSuccess({ apiKey: { id: updated.id, permissionIds: updated.permissionIds } }));
    } catch (error) {
      const status = permissionErrorStatus(error);
      if (status) {
        return c.json(actionFailure(error as Error), status);
      }
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

const _deleteApiKey = server.delete(
  "/:teamId/api-keys/:apiKeyId",
  requireTeamAccess(),
  requirePermission("core.api_keys.delete"),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
      apiKeyId: z.string(),
    })
  ),
  async (c) => {
    try {
      const apiKeyId = c.req.param("apiKeyId");
      await deleteApiKey(c.var.user.id, c.var.team.id, apiKeyId);
      await audit(c, {
        action: "delete",
        subsystem: "core.api_keys",
        objectType: "core.api_key",
        objectId: apiKeyId,
      });
      return c.json(actionSuccess());
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type ApiKeys =
  | typeof _getApiKeys
  | typeof _createApiKey
  | typeof _setApiKeyPermissions
  | typeof _deleteApiKey
  | typeof _isApiKeyCreationEnabled;

export default server;
