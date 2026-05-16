import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { retryRuleDelivery } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import { type DeliveryContext, deliveryParamSchema, deliveryParamSchemaWithTeamId, ruleDeliveryResponseSchema } from "./shared";

const server = new Server();

const retryRuleDeliveryRouteDescription = describeRoute({
  operationId: "retryRuleDelivery",
  summary: "Retry Rule Delivery",
  description: "Requeue a delivery for another attempt.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully queued retry", z.object({
      delivery: ruleDeliveryResponseSchema,
    })),
    ...describeErrorResponse(404, "Rule delivery not found"),
    ...describeErrorResponse(500, "Failed to retry rule delivery"),
  },
});

const _retryRuleDeliveryMinimal = server.post(
  "/rules/:id/deliveries/:ruleActionDeliveryId/retry",
  requireTeamAccess(),
  retryRuleDeliveryRouteDescription,
  zodValidator("param", deliveryParamSchema),
  _retryRuleDeliveryImplementation
);

const _retryRuleDelivery = server.post(
  "/:teamId/rules/:id/deliveries/:ruleActionDeliveryId/retry",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", deliveryParamSchemaWithTeamId),
  _retryRuleDeliveryImplementation
);

async function _retryRuleDeliveryImplementation(c: DeliveryContext) {
  try {
    const { id, ruleActionDeliveryId } = c.req.valid("param");
    const delivery = await retryRuleDelivery(c.var.team.id, id, ruleActionDeliveryId);
    if (!delivery) {
      return c.json(actionFailure("Rule delivery not found"), 404);
    }
    return c.json(actionSuccess({ delivery }));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not retry rule delivery"), 500);
  }
}

export type RetryRuleDelivery = typeof _retryRuleDelivery | typeof _retryRuleDeliveryMinimal;

export default server;
