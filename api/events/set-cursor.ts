import { setCursor } from "@core/data/event-cursors";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { cursorBodySchema, resolveConsumerId } from "./shared";

const server = new Server();

const _setCursor = server.put(
  "/event-cursors",
  requireTeamAccess({ installationOnly: true }),
  requirePermission("core.events.read"),
  describeRoute({ hide: true }),
  zodValidator("json", cursorBodySchema),
  async (c) => {
    try {
      const body = c.req.valid("json");
      const consumerId = resolveConsumerId(c);
      if (typeof consumerId !== "string") {
        return c.json(actionFailure(consumerId.error), consumerId.status);
      }
      const cursor = await setCursor(c.var.team.id, consumerId, body.lastSeq);
      return c.json(actionSuccess({ cursor }));
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type SetCursor = typeof _setCursor;

export default server;
