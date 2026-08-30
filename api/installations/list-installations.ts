import { listInstallations } from "@core/data/installations";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { teamIdParamSchema } from "./shared";

const server = new Server();

const _listInstallations = server.get(
  "/:teamId/installations",
  requireTeamAccess(),
  requirePermission("core.installations.manage"),
  describeRoute({ hide: true }),
  zodValidator("param", teamIdParamSchema),
  async (c) => {
    try {
      const installations = await listInstallations(c.var.team.id);
      return c.json(actionSuccess({ installations }));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type ListInstallations = typeof _listInstallations;

export default server;
