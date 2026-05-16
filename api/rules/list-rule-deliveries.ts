import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import "zod-openapi/extend";
import { listRuleDeliveriesPage } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import {
  type ListRuleDeliveriesContext,
  listRuleDeliveriesQuerySchema,
  ruleDeliveriesListResponseSchema,
  ruleIdParamSchema,
  ruleIdParamSchemaWithTeamId,
} from "./shared";

const server = new Server();

const listRuleDeliveriesRouteDescription = describeRoute({
  operationId: "listRuleDeliveries",
  summary: "List Rule Deliveries",
  description: "List delivery attempts for a rule.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully retrieved rule deliveries", ruleDeliveriesListResponseSchema),
    ...describeErrorResponse(500, "Failed to load rule deliveries"),
  },
});

const _listRuleDeliveriesMinimal = server.get(
  "/rules/:id/deliveries",
  requireTeamAccess(),
  listRuleDeliveriesRouteDescription,
  zodValidator("param", ruleIdParamSchema),
  zodValidator("query", listRuleDeliveriesQuerySchema),
  _listRuleDeliveriesImplementation
);

const _listRuleDeliveries = server.get(
  "/:teamId/rules/:id/deliveries",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", ruleIdParamSchemaWithTeamId),
  zodValidator("query", listRuleDeliveriesQuerySchema),
  _listRuleDeliveriesImplementation
);

async function _listRuleDeliveriesImplementation(c: ListRuleDeliveriesContext) {
  try {
    const result = await listRuleDeliveriesPage(c.var.team.id, c.req.valid("param").id, c.req.valid("query"));
    return c.json(actionSuccess(result));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not load rule deliveries"), 500);
  }
}

export type ListRuleDeliveries = typeof _listRuleDeliveries | typeof _listRuleDeliveriesMinimal;

export default server;
