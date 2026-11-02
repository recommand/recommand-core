import { getNotificationPreferences, setNotificationPreference } from "@core/data/notifications/preferences";
import { NotificationInputError } from "@core/data/notifications/shared";
import { requireAuth } from "@core/lib/auth-middleware";
import { withTranslation } from "@core/lib/translation-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { describeErrorResponse, describeSuccessResponse, describeValidationErrorResponse } from "../../lib/api-docs";
import { NOTIFICATIONS_TAG, preferenceBody, preferenceParam, preferencesResponse } from "./schemas";

const server = new Server();

const _getPreferences = server.get(
  "/account/notification-preferences",
  requireAuth(),
  withTranslation(),
  describeRoute({
    operationId: "getNotificationPreferences",
    summary: "Get my notification preferences",
    description:
      "Every notification kind, grouped, with the channels the signed-in user gets it through: their own choice, or the kind's defaults.",
    tags: [NOTIFICATIONS_TAG],
    responses: {
      ...describeSuccessResponse("The preferences", preferencesResponse),
      ...describeErrorResponse(401, "Not signed in"),
      ...describeErrorResponse(500, "Failed to load the preferences"),
    },
  }),
  async (c) => {
    const t = c.get("t");
    try {
      return c.json(actionSuccess(await getNotificationPreferences(c.var.user.id, t)));
    } catch (error) {
      console.error(error);
      return c.json(actionFailure(t`Could not load notification preferences`), 500);
    }
  }
);

const _setPreference = server.put(
  "/account/notification-preferences/:kind",
  requireAuth(),
  withTranslation(),
  describeRoute({
    operationId: "setNotificationPreference",
    summary: "Set my channels for a notification kind",
    description: "Chooses the channels the signed-in user gets one kind through. An empty list turns the kind off.",
    tags: [NOTIFICATIONS_TAG],
    responses: {
      ...describeSuccessResponse("The preference was saved"),
      ...describeValidationErrorResponse("Unknown kind or channel"),
      ...describeErrorResponse(401, "Not signed in"),
      ...describeErrorResponse(500, "Failed to save the preference"),
    },
  }),
  zodValidator("param", preferenceParam),
  zodValidator("json", preferenceBody),
  async (c) => {
    const t = c.get("t");
    try {
      await setNotificationPreference(c.var.user.id, c.req.valid("param").kind, c.req.valid("json").channels);
      return c.json(actionSuccess());
    } catch (error) {
      if (error instanceof NotificationInputError) {
        return c.json(actionFailure(t(error.message)), 400);
      }
      console.error(error);
      return c.json(actionFailure(t`Could not save the notification preference`), 500);
    }
  }
);

export type NotificationPreferences = typeof _getPreferences | typeof _setPreference;

export default server;
