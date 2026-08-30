import { listEvents } from "@core/data/events";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { listEventsQuerySchema } from "./shared";

const server = new Server();

const _listEvents = server.get(
  "/events",
  requireTeamAccess({ installationOnly: true }),
  requirePermission("core.events.read"),
  describeRoute({ hide: true }),
  zodValidator("query", listEventsQuerySchema),
  async (c) => {
    try {
      const query = c.req.valid("query");
      const result = await listEvents(c.var.team.id, {
        after: query.after,
        streamId: query.streamId,
        limit: query.limit,
      });
      return c.json(actionSuccess(result));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type ListEvents = typeof _listEvents;

export default server;
