import { type AuthenticatedTeamContext, type AuthenticatedUserContext, requireTeamAccess } from "@core/lib/auth-middleware";
import { Server, type Context } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { listRules } from "../../data/rules/rules";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import { listRulesQuerySchema, ruleResponseSchema, teamIdParamSchema } from "./shared";

const server = new Server();

const listRulesRouteDescription = describeRoute({
  operationId: "listRules",
  summary: "List Rules",
  description: "List automation rules for the current team.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully retrieved rules", z.object({
      rules: z.array(ruleResponseSchema),
    })),
    ...describeErrorResponse(500, "Failed to load rules"),
  },
});

type ListRulesContext = Context<
  AuthenticatedUserContext & AuthenticatedTeamContext,
  string,
  {
    in: {
      query: z.input<typeof listRulesQuerySchema>;
      param: z.input<typeof teamIdParamSchema>;
    };
    out: {
      query: z.infer<typeof listRulesQuerySchema>;
      param: z.infer<typeof teamIdParamSchema>;
    };
  }
>;

const _listRulesMinimal = server.get(
  "/rules",
  requireTeamAccess(),
  listRulesRouteDescription,
  zodValidator("query", listRulesQuerySchema),
  _listRulesImplementation
);

const _listRules = server.get(
  "/:teamId/rules",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", teamIdParamSchema),
  zodValidator("query", listRulesQuerySchema),
  _listRulesImplementation
);

async function _listRulesImplementation(c: ListRulesContext) {
  try {
    const query = c.req.valid("query");
    const rules = await listRules(c.var.team.id, {
      eventType: query.eventType ?? undefined,
      actionType: query.actionType ?? undefined,
      enabled: query.enabled === undefined ? undefined : query.enabled === "true",
    });

    return c.json(actionSuccess({ rules }));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not load rules"), 500);
  }
}

export type ListRules = typeof _listRules | typeof _listRulesMinimal;

export default server;
