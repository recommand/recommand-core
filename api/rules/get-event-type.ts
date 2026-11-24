import { requireAuth } from "@core/lib/auth-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import "zod-openapi/extend";
import { getEventTypeDefinition } from "../../data/rules/events";
import { describeErrorResponse, describeSuccessResponse } from "../../lib/api-docs";
import {
  eventTypeParamSchema,
  eventTypeResponseSchema,
  type GetEventTypeContext,
  mapEventTypeDefinition,
} from "./shared";

const server = new Server();

const getEventTypeRouteDescription = describeRoute({
  operationId: "getEventType",
  summary: "Get Event Type",
  description: "Fetch metadata for a single event type.",
  tags: ["Rules"],
  responses: {
    ...describeSuccessResponse("Successfully retrieved event type", eventTypeResponseSchema.openapi({ description: "The event type, with what a rule written for it can use." })),
    ...describeErrorResponse(401, "The user isn't signed in"),
    ...describeErrorResponse(404, "Event type not found"),
    ...describeErrorResponse(500, "Failed to load event type"),
  },
});

// The event types are the same for every team, so reading one takes a signed-in user, not a team
const _getEventType = server.get(
  "/event-types/:type",
  requireAuth(),
  getEventTypeRouteDescription,
  zodValidator("param", eventTypeParamSchema),
  _getEventTypeImplementation
);

async function _getEventTypeImplementation(c: GetEventTypeContext) {
  try {
    const definition = getEventTypeDefinition(c.req.valid("param").type);
    if (!definition) {
      return c.json(actionFailure("Event type not found"), 404);
    }

    return c.json(actionSuccess(mapEventTypeDefinition(definition)));
  } catch (error) {
    console.error(error);
    return c.json(actionFailure("Could not load event type"), 500);
  }
}

export type GetEventType = typeof _getEventType;

export default server;
