import { resolveEventData } from "@core/data/event-data";
import { events } from "@core/db/schema";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";
import { describeRoute } from "hono-openapi";

const server = new Server();

// Serves the point-in-time snapshot of one event. The snapshot is immutable,
// so consumers can retry this fetch freely and never observe mutated state.
// The teamId lives in the path (unlike the list route) so local service
// principals can resolve the team; installation tokens must match it.
const _getEventData = server.get(
  "/:teamId/events/:eventId/data",
  requireTeamAccess(),
  requirePermission("core.events.read"),
  describeRoute({ hide: true }),
  async (c) => {
    try {
      const [event] = await db
        .select({
          id: events.id,
          teamId: events.teamId,
          data: events.data,
          dataLocation: events.dataLocation,
          dataS3Key: events.dataS3Key,
          dataSizeBytes: events.dataSizeBytes,
        })
        .from(events)
        .where(
          and(
            eq(events.id, c.req.param("eventId")),
            eq(events.teamId, c.var.team.id)
          )
        )
        .limit(1);

      if (!event) {
        return c.json(actionFailure("Event not found"), 404);
      }
      if (event.dataLocation === "none") {
        return c.json(actionFailure("Event has no data snapshot"), 404);
      }

      const data = await resolveEventData(event);
      return c.json(actionSuccess({ data }));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type GetEventData = typeof _getEventData;

export default server;
