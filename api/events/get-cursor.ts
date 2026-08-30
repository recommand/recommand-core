import { getCursor } from "@core/data/event-cursors";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { describeRoute } from "hono-openapi";
import { resolveConsumerId } from "./shared";

const server = new Server();

const _getCursor = server.get(
  "/event-cursors",
  requireTeamAccess({ installationOnly: true }),
  requirePermission("core.events.read"),
  describeRoute({ hide: true }),
  async (c) => {
    try {
      const consumerId = resolveConsumerId(c);
      if (typeof consumerId !== "string") {
        return c.json(actionFailure(consumerId.error), consumerId.status);
      }
      const cursor = await getCursor(c.var.team.id, consumerId);
      return c.json(actionSuccess({ cursor }));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type GetCursor = typeof _getCursor;

export default server;
