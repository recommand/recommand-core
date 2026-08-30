import { deleteInstallation } from "@core/data/installations";
import { audit } from "@core/lib/audit";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { installationIdParamSchema } from "./shared";

const server = new Server();

const _deleteInstallation = server.delete(
  "/:teamId/installations/:installationId",
  requireTeamAccess(),
  requirePermission("core.installations.manage"),
  describeRoute({ hide: true }),
  zodValidator("param", installationIdParamSchema),
  async (c) => {
    try {
      const { installationId } = c.req.valid("param");
      await deleteInstallation(c.var.team.id, installationId);
      await audit(c, {
        action: "delete",
        subsystem: "core.installations",
        objectType: "core.installation",
        objectId: installationId,
      });
      return c.json(actionSuccess());
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type DeleteInstallation = typeof _deleteInstallation;

export default server;
