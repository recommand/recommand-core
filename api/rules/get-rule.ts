import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { getRule } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import { type RuleContext, ruleIdParamSchema, ruleIdParamSchemaWithTeamId, ruleResponseSchema } from "./shared";

const server = new Server();

const getRuleRouteDescription = describeRoute({
  operationId: "getRule",
  summary: "Get Rule",
  description: "Fetch a single automation rule by ID.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully retrieved rule", z.object({
      rule: ruleResponseSchema,
    })),
    ...describeErrorResponse(404, "Rule not found"),
    ...describeErrorResponse(500, "Failed to load rule"),
  },
});

const _getRuleMinimal = server.get(
  "/rules/:id",
  requireTeamAccess(),
  getRuleRouteDescription,
  zodValidator("param", ruleIdParamSchema),
  _getRuleImplementation
);

const _getRule = server.get(
  "/:teamId/rules/:id",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", ruleIdParamSchemaWithTeamId),
  _getRuleImplementation
);

async function _getRuleImplementation(c: RuleContext) {
  try {
    const rule = await getRule(c.var.team.id, c.req.valid("param").id);
    if (!rule) {
      return c.json(actionFailure("Rule not found"), 404);
    }
    return c.json(actionSuccess({ rule }));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not load rule"), 500);
  }
}

export type GetRule = typeof _getRule | typeof _getRuleMinimal;

export default server;
