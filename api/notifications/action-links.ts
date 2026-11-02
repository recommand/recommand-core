import { NotificationInputError } from "@core/data/notifications/shared";
import { performActionLink, readActionLink } from "@core/data/notifications/actions";
import { optionalAuth } from "@core/lib/auth-middleware";
import { withTranslation } from "@core/lib/translation-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { takeActionBody, tokenParam } from "./schemas";

const server = new Server();

// Only the public confirmation page calls these routes, so the API reference does not show them.
// The signed-in user counts from a browser session only: an API key never acts through a link.
const browserSession = optionalAuth({ cookieOnly: true });

// Changes nothing, so mail scanners that open links do no harm.
const _getActionLink = server.get(
  "/notification-actions/:token",
  describeRoute({ hide: true, security: [] }),
  browserSession,
  zodValidator("param", tokenParam),
  async (c) => {
    try {
      const link = await readActionLink(c.req.valid("param").token, c.get("user")?.id ?? null);
      return c.json(actionSuccess(link));
    } catch (error) {
      console.error(error);
      return c.json(actionFailure("Could not read the link"), 500);
    }
  }
);

const _takeAction = server.post(
  "/notification-actions/:token",
  describeRoute({ hide: true, security: [] }),
  browserSession,
  withTranslation(),
  zodValidator("param", tokenParam),
  zodValidator("json", takeActionBody),
  async (c) => {
    const t = c.get("t");
    try {
      const { action, reason } = c.req.valid("json");
      const result = await performActionLink({
        token: c.req.valid("param").token,
        action,
        reason: reason ?? null,
        sessionUserId: c.get("user")?.id ?? null,
      });
      switch (result.state) {
        case "loginRequired":
          return c.json(actionFailure(t`Sign in to continue`), 401);
        case "wrongUser":
          return c.json(actionFailure(t`This link is for another user`), 403);
        case "invalid":
          return c.json(actionFailure(t`This link does not exist`), 404);
        case "expired":
          return c.json(actionFailure(t`This link expired`), 410);
        default:
          return c.json(actionSuccess({ state: result.state }));
      }
    } catch (error) {
      if (error instanceof NotificationInputError) {
        return c.json(actionFailure(t(error.message)), 400);
      }
      console.error(error);
      return c.json(actionFailure(t`Could not take the action`), 500);
    }
  }
);

export type NotificationActionLinks = typeof _getActionLink | typeof _takeAction;

export default server;
