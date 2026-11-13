import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { createApiKey, deleteApiKey, getApiKeys, getApiKeyCreationStatus, getAvailableApiKeyPermissions, setApiKeyPermissions } from "@core/data/api-keys";
import {
  InvalidPermissionScopeError,
  NotAuthorizedError,
  PermissionNotRegisteredError,
} from "@core/data/permissions";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { MAX_API_KEY_EXPIRES_IN_SECONDS } from "@core/lib/api-key-expiry";
import { describeErrorResponse, describeSuccessResponse } from "@core/lib/api-docs";
import { audit } from "@core/lib/audit";
import { insufficientPermissionBody, requirePermission } from "@core/lib/permissions/permission-middleware";

const server = new Server();

export const createApiKeyBodySchema = z.discriminatedUnion("type", [
  z.object({
    expiresInSeconds: z.number().int().min(1).max(MAX_API_KEY_EXPIRES_IN_SECONDS).optional().openapi({
      description: "Seconds until the key expires. Without it, the key doesn't expire.",
    }),
    name: z.string(),
    permissionIds: z.array(z.string()).optional(),
    type: z.literal("basic"),
  }),
  z.object({
    expiresInSeconds: z
      .number()
      .int()
      .min(1)
      .max(MAX_API_KEY_EXPIRES_IN_SECONDS)
      .default(24 * 60 * 60)
      .openapi({ description: "Seconds until the key expires." }),
    name: z.string(),
    permissionIds: z.array(z.string()).optional(),
    type: z.literal("jwt"),
  }),
]);

/** The answer for permissions that can't be put on a key, or null for any other error. */
const permissionFailure = (error: unknown) => {
  if (error instanceof PermissionNotRegisteredError || error instanceof InvalidPermissionScopeError) {
    return { body: actionFailure(error), status: 400 as const };
  }

  if (error instanceof NotAuthorizedError) {
    // The caller asked for a permission they don't hold, so it answers like a missing one
    return { body: { ...actionFailure(error), code: "insufficient_permission" as const }, status: 403 as const };
  }

  return null;
};

const apiKeyTypeSchema = z.enum(["basic", "jwt"]).openapi({ description: "How the key authenticates.", ref: "ApiKeyType" });

const createdApiKeySchema = z
  .object({
    expiresAt: z.string().nullable().openapi({ description: "When the key expires, or `null` if it doesn't." }),
    id: z.string().openapi({ description: "The API key's id." }),
    jwt: z.string().optional().openapi({ description: "The token of a `jwt` key, only returned now." }),
    name: z.string().openapi({ description: "The key's name." }),
    permissionIds: z.array(z.string()).openapi({ description: "The ids of the team permissions the key holds." }),
    secret: z.string().optional().openapi({ description: "The secret of a `basic` key, only returned now." }),
    type: apiKeyTypeSchema,
  })
  .openapi({ ref: "CreatedApiKey" });

const permissionIdsSchema = z.array(z.string()).openapi({ description: "The ids of the team permissions the key holds." });

const availablePermissionSchema = z
  .object({
    description: z.string().optional().openapi({ description: "What the permission allows." }),
    id: z.string().openapi({ description: "The permission's id, such as `core.api_keys.read`." }),
    name: z.string().openapi({ description: "The permission's name." }),
    resource: z.string().optional().openapi({ description: "What the permission is about, such as `API keys`." }),
  })
  .openapi({ ref: "ApiKeyAvailablePermission" });

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
  describeRoute({
    description: "Create an API key for the caller in the team. Without `permissionIds`, it gets all of the caller's team permissions, and no more than the key they authenticate with.",
    hide: true,
    operationId: "createApiKey",
    responses: {
      ...describeSuccessResponse("The key was created", z.object({ apiKey: createdApiKeySchema })),
      ...describeErrorResponse(400, "A permission is unknown or not a team permission"),
      // Replaces the 403 `requirePermission` documents, so it names that cause too
      ...describeErrorResponse(
        403,
        "The credential lacks the `core.api_keys.write` permission, or one of the permissions asked for.",
        insufficientPermissionBody
      ),
      ...describeErrorResponse(500, "Failed to create the key"),
    },
    summary: "Create API Key",
    tags: ["API Keys"],
  }),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  zodValidator(
    "json",
    createApiKeyBodySchema
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
      const failure = permissionFailure(error);
      if (failure) {
        return c.json(failure.body, failure.status);
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

const _getAvailableApiKeyPermissions = server.get(
  "/:teamId/api-keys/available-permissions",
  requireTeamAccess(),
  requirePermission("core.api_keys.write"),
  describeRoute({
    description: "List the team permissions the caller can put on a key of their own: the ones they hold, and no more than the key they authenticate with.",
    hide: true,
    operationId: "listAvailableApiKeyPermissions",
    responses: {
      ...describeSuccessResponse("The permissions available for a key", z.object({
        permissions: z.array(availablePermissionSchema).openapi({ description: "The available permissions, sorted by id." }),
      })),
      ...describeErrorResponse(500, "Failed to list the available permissions"),
    },
    summary: "List Available API Key Permissions",
    tags: ["API Keys"],
  }),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  async (c) => {
    try {
      const permissions = await getAvailableApiKeyPermissions(c.var.user.id, c.var.team.id, c.get("apiKey")?.id);

      return c.json(actionSuccess({
        permissions: permissions.map(({ description, id, name, resource }) => ({ description, id, name, resource })),
      }));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

const _setApiKeyPermissions = server.put(
  "/:teamId/api-keys/:apiKeyId/permissions",
  requireTeamAccess(),
  requirePermission("core.api_keys.write"),
  describeRoute({
    description: "Replace the team permissions of one of the caller's own API keys. The caller must hold each of them.",
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
      ...describeErrorResponse(404, "The API key was not found among the caller's keys"),
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
      const failure = permissionFailure(error);
      if (failure) {
        return c.json(failure.body, failure.status);
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
  | typeof _getAvailableApiKeyPermissions
  | typeof _createApiKey
  | typeof _setApiKeyPermissions
  | typeof _deleteApiKey
  | typeof _isApiKeyCreationEnabled;

export default server;
