import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { createRule } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import { createRuleSchema } from "../../lib/rules/types";
import { type CreateRuleContext, ruleResponseSchema, teamIdParamSchema } from "./shared";

const server = new Server();

const createRuleRouteDescription = describeRoute({
  operationId: "createRule",
  summary: "Create Rule",
  description: "Create a new automation rule for the current team.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully created rule", z.object({
      rule: ruleResponseSchema,
    })),
    ...describeErrorResponse(400, "Invalid rule payload"),
  },
});

const _createRuleMinimal = server.post(
  "/rules",
  requireTeamAccess(),
  createRuleRouteDescription,
  zodValidator("json", createRuleSchema),
  _createRuleImplementation
);

const _createRule = server.post(
  "/:teamId/rules",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", teamIdParamSchema),
  zodValidator("json", createRuleSchema),
  _createRuleImplementation
);

async function _createRuleImplementation(c: CreateRuleContext) {
  try {
    const rule = await createRule(c.var.team.id, c.req.valid("json"));
    return c.json(actionSuccess({ rule }));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure(error instanceof Error ? error.message : "Could not create rule"), 400);
  }
}

export type CreateRule = typeof _createRule | typeof _createRuleMinimal;

export default server;
