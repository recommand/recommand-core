import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { disconnectApp, listConnectedApps } from "@core/data/oauth-grants";
import { describeErrorResponse, describeSuccessResponse } from "@core/lib/api-docs";
import { audit } from "@core/lib/audit";
import { requireAuth } from "@core/lib/auth-middleware";
import { getDelegablePermission } from "@core/lib/permissions";
import { withTranslation } from "@core/lib/translation-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";

const server = new Server();

const connectedAppClientSchema = z
  .object({
    host: z.string().nullable().openapi({ description: "The host of the client's metadata document, which identifies it; null for a registered client." }),
    id: z.string(),
    name: z.string().nullable(),
    uri: z.string().nullable(),
  })
  .openapi({ ref: "ConnectedAppClient" });

const connectedAppPermissionSchema = z
  .object({ id: z.string(), name: z.string() })
  .openapi({ ref: "ConnectedAppPermission" });

const connectedAppTeamSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    permissions: z.array(connectedAppPermissionSchema),
  })
  .openapi({ ref: "ConnectedAppTeam" });

const connectedAppSchema = z
  .object({
    client: connectedAppClientSchema,
    connectedAt: z.string().datetime(),
    lastUsedAt: z.string().datetime().nullable(),
    teams: z.array(connectedAppTeamSchema),
  })
  .openapi({ ref: "ConnectedApp" });

/** The apps the user connected, with the teams and permissions each can reach. */
const _getConnectedApps = server.get(
  "/oauth/connected-apps",
  describeRoute({
    description: "List the apps the user connected, newest first, with the teams and permissions each can reach.",
    hide: true,
    operationId: "listConnectedApps",
    responses: {
      ...describeSuccessResponse("The connected apps", z.object({ apps: z.array(connectedAppSchema) })),
    },
    summary: "List Connected Apps",
    tags: ["OAuth"],
  }),
  requireAuth(),
  async (c) => {
    const apps = await listConnectedApps(c.get("user").id);
    return c.json(
      actionSuccess({
        apps: apps.map((app) => ({
          client: {
            host: URL.canParse(app.client.id) ? new URL(app.client.id).host : null,
            id: app.client.id,
            name: app.client.name,
            uri: app.client.clientUri,
          },
          connectedAt: app.connectedAt.toISOString(),
          lastUsedAt: app.lastUsedAt?.toISOString() ?? null,
          teams: app.teams.map((team) => ({
            id: team.id,
            name: team.name,
            // A permission that is no longer delegable was already taken from the grant
            permissions: team.permissionIds.map((permissionId) => ({
              id: permissionId,
              name: getDelegablePermission(permissionId)?.name ?? permissionId,
            })),
          })),
        })),
      })
    );
  }
);

/**
 * Disconnects an app: every grant the user gave it is deleted, and its tokens
 * stop working at once. The client ID is a query parameter, since it can be a URL.
 */
const _disconnectApp = server.delete(
  "/oauth/connected-apps",
  describeRoute({
    description: "Delete every grant the user gave an app, so its tokens stop working at once.",
    hide: true,
    operationId: "disconnectApp",
    responses: {
      ...describeSuccessResponse("The app was disconnected"),
      ...describeErrorResponse(404, "The user didn't connect this app"),
    },
    summary: "Disconnect an App",
    tags: ["OAuth"],
  }),
  requireAuth(),
  withTranslation(),
  zodValidator("query", z.object({ clientId: z.string() })),
  async (c) => {
    const t = c.get("t");
    const grantIds = await disconnectApp(c.get("user").id, c.req.valid("query").clientId);
    if (grantIds.length === 0) {
      return c.json(actionFailure(t`Connected app not found`), 404);
    }
    await Promise.all(
      grantIds.map((grantId) =>
        audit(c, {
          action: "revoke_access",
          objectId: grantId,
          objectType: "core.oauth_grant",
          reasonCode: "user_revoked",
          subsystem: "core.oauth",
        })
      )
    );
    return c.json(actionSuccess());
  }
);

export type OAuthConnectedApps = typeof _getConnectedApps | typeof _disconnectApp;

export default server;
