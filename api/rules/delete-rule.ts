import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import "zod-openapi/extend";
import { deleteRule } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponse } from "../../lib/api-docs";
import { type RuleContext, ruleIdParamSchema, ruleIdParamSchemaWithTeamId } from "./shared";

const server = new Server();

const deleteRuleRouteDescription = describeRoute({
  operationId: "deleteRule",
  summary: "Delete Rule",
  description: "Delete an automation rule.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponse("Successfully deleted rule"),
    ...describeErrorResponse(500, "Failed to delete rule"),
  },
});

const _deleteRuleMinimal = server.delete(
  "/rules/:id",
  requireTeamAccess(),
  deleteRuleRouteDescription,
  zodValidator("param", ruleIdParamSchema),
  _deleteRuleImplementation
);

const _deleteRule = server.delete(
  "/:teamId/rules/:id",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", ruleIdParamSchemaWithTeamId),
  _deleteRuleImplementation
);

async function _deleteRuleImplementation(c: RuleContext) {
  try {
    await deleteRule(c.var.team.id, c.req.valid("param").id);
    return c.json(actionSuccess({}));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not delete rule"), 500);
  }
}

export type DeleteRule = typeof _deleteRule | typeof _deleteRuleMinimal;

export default server;
