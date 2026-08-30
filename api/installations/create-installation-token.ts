import { createInstallationToken } from "@core/data/installations";
import { audit } from "@core/lib/audit";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import {
  createInstallationTokenBodySchema,
  installationIdParamSchema,
} from "./shared";

const server = new Server();

const _createInstallationToken = server.post(
  "/:teamId/installations/:installationId/tokens",
  requireTeamAccess(),
  requirePermission("core.installations.manage"),
  describeRoute({ hide: true }),
  zodValidator("param", installationIdParamSchema),
  zodValidator("json", createInstallationTokenBodySchema),
  async (c) => {
    try {
      const { installationId } = c.req.valid("param");
      const body = c.req.valid("json");
      const created = await createInstallationToken({
        teamId: c.var.team.id,
        installationId,
        expiresInSeconds: body.expiresInSeconds,
      });
      if (!created) {
        return c.json(actionFailure("Installation not found"), 404);
      }
      await audit(c, {
        action: "create",
        subsystem: "core.installations",
        objectType: "core.installation_token",
        objectId: created.token.id,
        after: {
          installationId: created.installation.id,
          expiresAt: created.token.expiresAt.toISOString(),
        },
      });
      return c.json(actionSuccess(created));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type CreateInstallationToken = typeof _createInstallationToken;

export default server;
