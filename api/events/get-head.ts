import { getHeadSeq } from "@core/data/events";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { describeRoute } from "hono-openapi";

const server = new Server();

// The log position a consumer takes a snapshot at. The in-repo tracker records
// it per projection (see ProjectionBootstrap in data/event-handlers.ts); an
// external consumer reads it, takes its snapshot, and puts its cursor here.
// Read head before the snapshot: anything that changes in between is in the
// snapshot or has an event above the head.
const _getHead = server.get(
  "/events/head",
  requireTeamAccess({ installationOnly: true }),
  requirePermission("core.events.read"),
  describeRoute({ hide: true }),
  async (c) => {
    try {
      const seq = await getHeadSeq(c.var.team.id);
      return c.json(actionSuccess({ seq }));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type GetHead = typeof _getHead;

export default server;
