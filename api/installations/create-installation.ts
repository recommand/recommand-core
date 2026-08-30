import { createInstallation } from "@core/data/installations";
import {
  InvalidPermissionScopeError,
  NotAuthorizedError,
  PermissionNotRegisteredError,
} from "@core/data/permissions";
import { audit } from "@core/lib/audit";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { Server } from "@recommand/lib/api";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { createInstallationBodySchema, teamIdParamSchema } from "./shared";

const server = new Server();

const _createInstallation = server.post(
  "/:teamId/installations",
  requireTeamAccess(),
  requirePermission("core.installations.manage"),
  describeRoute({ hide: true }),
  zodValidator("param", teamIdParamSchema),
  zodValidator("json", createInstallationBodySchema),
  async (c) => {
    try {
      const body = c.req.valid("json");
      const created = await createInstallation({
        teamId: c.var.team.id,
        name: body.name,
        expiresInSeconds: body.expiresInSeconds,
        actorUserId: c.var.user.id,
        permissionIds: body.permissionIds,
      });
      await audit(c, {
        action: "create",
        subsystem: "core.installations",
        objectType: "core.installation",
        objectId: created.installation.id,
        after: {
          name: created.installation.name,
          tokenId: created.token.id,
          expiresAt: created.token.expiresAt.toISOString(),
        },
      });
      return c.json(actionSuccess(created));
    } catch (error) {
      if (
        error instanceof PermissionNotRegisteredError ||
        error instanceof InvalidPermissionScopeError
      ) {
        return c.json(actionFailure(error.message), 400);
      }
      if (error instanceof NotAuthorizedError) {
        return c.json(actionFailure(error.message), 403);
      }
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type CreateInstallation = typeof _createInstallation;

export default server;
