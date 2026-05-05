import { requireTeamAccess } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { listEventTypeDefinitions } from "../../data/rules/events";
import { describeErrorResponse, describeSuccessResponseWithZod } from "../../lib/api-docs";
import { mapEventTypeDefinition, eventTypeResponseSchema, teamIdParamSchema, type ListEventTypesContext } from "./shared";

const server = new Server();

const listEventTypesRouteDescription = describeRoute({
  operationId: "listEventTypes",
  summary: "List Event Types",
  description: "List event types available for rule authoring.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponseWithZod("Successfully retrieved event types", z.object({
      eventTypes: z.array(eventTypeResponseSchema),
    })),
    ...describeErrorResponse(500, "Failed to load event types"),
  },
});

const _listEventTypesMinimal = server.get(
  "/event-types",
  requireTeamAccess(),
  listEventTypesRouteDescription,
  _listEventTypesImplementation
);

const _listEventTypes = server.get(
  "/:teamId/event-types",
  requireTeamAccess(),
  describeRoute({ hide: true }),
  zodValidator("param", teamIdParamSchema),
  _listEventTypesImplementation
);

async function _listEventTypesImplementation(c: ListEventTypesContext) {
  try {
    const definitions = listEventTypeDefinitions().map(mapEventTypeDefinition);
    return c.json(actionSuccess({ eventTypes: definitions }));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not load event types"), 500);
  }
}

export type ListEventTypes = typeof _listEventTypes | typeof _listEventTypesMinimal;

export default server;
