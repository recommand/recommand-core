import { zodValidator } from "@recommand/lib/zod-validator";
import { z } from "zod";
import { actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { describeRoute } from "hono-openapi";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import {
  formatEntitlementMessage,
  getEffectiveEntitlements,
  getRegisteredEntitlements,
} from "@core/lib/entitlements";

const server = new Server();

const _getTeamEntitlements = server.get(
  "/teams/:teamId/entitlements",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", z.object({ teamId: z.string() })),
  async (c) => {
    const team = c.var.team;
    const ids = getRegisteredEntitlements().map((entitlement) => entitlement.id);
    const entitlements = await getEffectiveEntitlements(team.id, ids);
    return c.json(
      actionSuccess({
        entitlements: entitlements.map((entitlement) => ({
          ...entitlement,
          message: formatEntitlementMessage(entitlement.message, { teamName: team.name }),
        })),
      })
    );
  }
);

export type Entitlements = typeof _getTeamEntitlements;

export default server;
