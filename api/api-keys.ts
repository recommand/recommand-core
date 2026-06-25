import { zodValidator } from "@recommand/lib/zod-validator";
import { z } from "zod";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { createApiKey, deleteApiKey, getApiKeys, isApiKeyCreationPermitted } from "@core/data/api-keys";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { audit } from "@core/lib/audit";

const server = new Server();

const _getApiKeys = server.get(
  "/:teamId/api-keys",
  requireTeamAccess(),
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
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

const _isApiKeyCreationEnabled = server.get(
  "/:teamId/api-keys/is-creation-permitted",
  requireTeamAccess(),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  async (c) => {
    return c.json(actionSuccess({
      isPermitted: await isApiKeyCreationPermitted(c.var.team.id),
    }))
  }
);

const _deleteApiKey = server.delete(
  "/:teamId/api-keys/:apiKeyId",
  requireTeamAccess(),
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
  | typeof _deleteApiKey
  | typeof _isApiKeyCreationEnabled;

export default server;
