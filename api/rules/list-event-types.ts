import { requireAuth } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import "zod-openapi/extend";
import { listEventTypeDefinitions } from "../../data/rules/events";
import { describeErrorResponse, describeSuccessResponse } from "../../lib/api-docs";
import { mapEventTypeDefinition, eventTypeResponseSchema, type ListEventTypesContext } from "./shared";

const server = new Server();

const listEventTypesRouteDescription = describeRoute({
  operationId: "listEventTypes",
  summary: "List Event Types",
  description: "List event types available for rule authoring.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponse("Successfully retrieved event types", z.object({
      eventTypes: z.array(eventTypeResponseSchema).openapi({ description: "The event types rules can be written for." }),
    })),
    ...describeErrorResponse(401, "The user isn't signed in"),
    ...describeErrorResponse(500, "Failed to load event types"),
  },
});

// The event types are the same for every team, so reading them takes a signed-in user, not a team
const _listEventTypes = server.get(
  "/event-types",
  requireAuth(),
  listEventTypesRouteDescription,
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

export type ListEventTypes = typeof _listEventTypes;

export default server;
