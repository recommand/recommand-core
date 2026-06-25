import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { updateRule } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import { audit } from "../../lib/audit";
import { updateRuleSchema } from "../../lib/rules/types";
import { ruleAuditSnapshot } from "./audit";
import { type UpdateRuleContext, ruleIdParamSchema, ruleIdParamSchemaWithTeamId, ruleResponseSchema } from "./shared";

const server = new Server();

const updateRuleRouteDescription = describeRoute({
  operationId: "updateRule",
  summary: "Update Rule",
  description: "Update an existing automation rule.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully updated rule", z.object({
      rule: ruleResponseSchema,
    })),
    ...describeErrorResponse(400, "Invalid rule payload"),
    ...describeErrorResponse(404, "Rule not found"),
  },
});

const _updateRuleMinimal = server.patch(
  "/rules/:id",
  requireTeamAccess(),
  updateRuleRouteDescription,
  zodValidator("param", ruleIdParamSchema),
  zodValidator("json", updateRuleSchema),
  _updateRuleImplementation
);

const _updateRule = server.patch(
  "/:teamId/rules/:id",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", ruleIdParamSchemaWithTeamId),
  zodValidator("json", updateRuleSchema),
  _updateRuleImplementation
);

async function _updateRuleImplementation(c: UpdateRuleContext) {
  try {
    const ruleId = c.req.valid("param").id;
    const rule = await updateRule(c.var.team.id, ruleId, c.req.valid("json"));
    if (!rule) {
      return c.json(actionFailure("Rule not found"), 404);
    }
    await audit(c, {
      action: "update",
      subsystem: "core.rules",
      objectType: "core.rule",
      objectId: rule.id,
      after: ruleAuditSnapshot(rule),
    });
    return c.json(actionSuccess({ rule }));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure(error instanceof Error ? error.message : "Could not update rule"), 400);
  }
}

export type UpdateRule = typeof _updateRule | typeof _updateRuleMinimal;

export default server;
