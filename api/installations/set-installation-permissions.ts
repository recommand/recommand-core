import { setInstallationPermissions } from "@core/data/installations";
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
import { installationIdParamSchema, setPermissionsBodySchema } from "./shared";

const server = new Server();

const _setInstallationPermissions = server.put(
  "/:teamId/installations/:installationId/permissions",
  requireTeamAccess(),
  requirePermission("core.installations.manage"),
  describeRoute({ hide: true }),
  zodValidator("param", installationIdParamSchema),
  zodValidator("json", setPermissionsBodySchema),
  async (c) => {
    try {
      const { installationId } = c.req.valid("param");
      const updated = await setInstallationPermissions({
        teamId: c.var.team.id,
        installationId,
        actorUserId: c.var.user.id,
        permissionIds: c.req.valid("json").permissionIds,
      });
      if (!updated) {
        return c.json(actionFailure("Installation not found"), 404);
      }
      await audit(c, {
        action: "update",
        subsystem: "core.installations",
        objectType: "core.installation",
        objectId: installationId,
        after: {
          permissionIds: updated.permissionIds,
        },
      });
      return c.json(actionSuccess(updated));
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

export type SetInstallationPermissions = typeof _setInstallationPermissions;

export default server;
