import { deleteInstallationToken } from "@core/data/installations";
import { audit } from "@core/lib/audit";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { installationTokenParamSchema } from "./shared";

const server = new Server();

const _deleteInstallationToken = server.delete(
  "/:teamId/installations/:installationId/tokens/:tokenId",
  requireTeamAccess(),
  requirePermission("core.installations.manage"),
  describeRoute({ hide: true }),
  zodValidator("param", installationTokenParamSchema),
  async (c) => {
    try {
      const { installationId, tokenId } = c.req.valid("param");
      const deleted = await deleteInstallationToken(
        c.var.team.id,
        installationId,
        tokenId
      );
      if (deleted === 0) {
        return c.json(actionFailure("Token not found"), 404);
      }
      await audit(c, {
        action: "delete",
        subsystem: "core.installations",
        objectType: "core.installation_token",
        objectId: tokenId,
        after: {
          installationId,
        },
      });
      return c.json(actionSuccess());
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type DeleteInstallationToken = typeof _deleteInstallationToken;

export default server;
