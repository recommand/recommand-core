import {
  userGlobalPermissions,
  userPermissions,
  users,
  teamMembers,
} from "@core/db/schema";
import { emitBackendEvent, CORE_BACKEND_EVENTS } from "@core/lib/backend-events";
import {
  getRegisteredPermission,
  getRegisteredPermissionsByScope,
  type Permission,
  type PermissionScope,
} from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";

export type UserPermission = typeof userPermissions.$inferSelect;
export type UserGlobalPermission = typeof userGlobalPermissions.$inferSelect;

export class PermissionNotRegisteredError extends Error {
  constructor(permissionId: string) {
    super(`Permission "${permissionId}" is not registered`);
    this.name = "PermissionNotRegisteredError";
  }
}

export class InvalidPermissionScopeError extends Error {
  constructor(
    permissionId: string,
    expectedScope: PermissionScope,
    actualScope: PermissionScope,
  ) {
    super(
      `Permission "${permissionId}" has scope "${actualScope}" but "${expectedScope}" was expected`,
    );
    this.name = "InvalidPermissionScopeError";
  }
}

export class NotAuthorizedError extends Error {
  constructor(message = "User is not authorized to perform this action") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

async function isUserAdmin(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.isAdmin ?? false;
}

async function canAccessTeamPermissions(
  userId: string,
  teamId: string,
): Promise<boolean> {
  if (await isUserAdmin(userId)) {
    return true;
  }

  const membership = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
    .limit(1);

  return membership.length > 0;
}

function assertPermissionScope(
  permission: Permission,
  expectedScope: PermissionScope,
): void {
  if (permission.scope !== expectedScope) {
    throw new InvalidPermissionScopeError(
      permission.id,
      expectedScope,
      permission.scope ?? "team",
    );
  }
}

async function canActorModifyTeamPermission(
  actorUserId: string,
  teamId: string,
  permission: Permission,
): Promise<boolean> {
  assertPermissionScope(permission, "team");

  if (!(await canAccessTeamPermissions(actorUserId, teamId))) {
    return false;
  }

  const isAdmin = await isUserAdmin(actorUserId);
  if (isAdmin) {
    return true;
  }

  if (permission.hasAdminPrerequisite) {
    return false;
  }

  if (permission.prerequisiteActorPermissionIds.length === 0) {
    return true;
  }

  const actorPermissions = await db
    .select({ permissionId: userPermissions.permissionId })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, actorUserId),
        eq(userPermissions.teamId, teamId),
        inArray(
          userPermissions.permissionId,
          permission.prerequisiteActorPermissionIds,
        ),
      ),
    );

  const actorPermissionIds = new Set(
    actorPermissions.map((actorPermission) => actorPermission.permissionId),
  );

  return permission.prerequisiteActorPermissionIds.every((permissionId) =>
    actorPermissionIds.has(permissionId),
  );
}

async function canActorModifyGlobalPermission(
  actorUserId: string,
  permission: Permission,
): Promise<boolean> {
  assertPermissionScope(permission, "global");

  const isAdmin = await isUserAdmin(actorUserId);
  if (isAdmin) {
    return true;
  }

  if (permission.hasAdminPrerequisite) {
    return false;
  }

  if (permission.prerequisiteActorPermissionIds.length === 0) {
    return true;
  }

  const actorPermissions = await db
    .select({ permissionId: userGlobalPermissions.permissionId })
    .from(userGlobalPermissions)
    .where(
      and(
        eq(userGlobalPermissions.userId, actorUserId),
        inArray(
          userGlobalPermissions.permissionId,
          permission.prerequisiteActorPermissionIds,
        ),
      ),
    );

  const actorPermissionIds = new Set(
    actorPermissions.map((actorPermission) => actorPermission.permissionId),
  );

  return permission.prerequisiteActorPermissionIds.every((permissionId) =>
    actorPermissionIds.has(permissionId),
  );
}

export async function grantPermission(
  userId: string,
  teamId: string,
  permissionId: string,
  grantedByUserId: string,
): Promise<UserPermission> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    throw new PermissionNotRegisteredError(permissionId);
  }

  assertPermissionScope(permission, "team");

  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    throw new NotAuthorizedError(
      "User must be a member of the team to be granted permissions",
    );
  }

  const canModify = await canActorModifyTeamPermission(
    grantedByUserId,
    teamId,
    permission,
  );
  if (!canModify) {
    throw new NotAuthorizedError(
      "You don't have permission to grant this permission",
    );
  }

  const [result] = await db
    .insert(userPermissions)
    .values({ userId, teamId, permissionId, grantedByUserId })
    .onConflictDoNothing()
    .returning();

  if (result) {
    await emitBackendEvent(CORE_BACKEND_EVENTS.PERMISSION_GRANTED, {
      scope: "team" as const,
      userId,
      teamId,
      permissionId,
      grantedByUserId,
    });
  }

  return result;
}

export async function grantGlobalPermission(
  userId: string,
  permissionId: string,
  grantedByUserId: string,
): Promise<UserGlobalPermission> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    throw new PermissionNotRegisteredError(permissionId);
  }

  assertPermissionScope(permission, "global");

  const canModify = await canActorModifyGlobalPermission(
    grantedByUserId,
    permission,
  );
  if (!canModify) {
    throw new NotAuthorizedError(
      "You don't have permission to grant this permission",
    );
  }

  const [result] = await db
    .insert(userGlobalPermissions)
    .values({ userId, permissionId, grantedByUserId })
    .onConflictDoNothing()
    .returning();

  if (result) {
    await emitBackendEvent(CORE_BACKEND_EVENTS.PERMISSION_GRANTED, {
      scope: "global" as const,
      userId,
      permissionId,
      grantedByUserId,
    });
  }

  return result;
}

export async function revokePermission(
  userId: string,
  teamId: string,
  permissionId: string,
  revokedByUserId: string,
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    throw new PermissionNotRegisteredError(permissionId);
  }

  assertPermissionScope(permission, "team");

  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    throw new NotAuthorizedError(
      "User must be a member of the team to have permissions revoked",
    );
  }

  const canModify = await canActorModifyTeamPermission(
    revokedByUserId,
    teamId,
    permission,
  );
  if (!canModify) {
    throw new NotAuthorizedError(
      "You don't have permission to revoke this permission",
    );
  }

  const result = await db
    .delete(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.teamId, teamId),
        eq(userPermissions.permissionId, permissionId),
      ),
    );

  const wasRevoked = (result.rowCount ?? 0) > 0;

  if (wasRevoked) {
    await emitBackendEvent(CORE_BACKEND_EVENTS.PERMISSION_REVOKED, {
      scope: "team" as const,
      userId,
      teamId,
      permissionId,
      revokedByUserId,
    });
  }

  return wasRevoked;
}

export async function revokeGlobalPermission(
  userId: string,
  permissionId: string,
  revokedByUserId: string,
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    throw new PermissionNotRegisteredError(permissionId);
  }

  assertPermissionScope(permission, "global");

  const canModify = await canActorModifyGlobalPermission(
    revokedByUserId,
    permission,
  );
  if (!canModify) {
    throw new NotAuthorizedError(
      "You don't have permission to revoke this permission",
    );
  }

  const result = await db
    .delete(userGlobalPermissions)
    .where(
      and(
        eq(userGlobalPermissions.userId, userId),
        eq(userGlobalPermissions.permissionId, permissionId),
      ),
    );

  const wasRevoked = (result.rowCount ?? 0) > 0;

  if (wasRevoked) {
    await emitBackendEvent(CORE_BACKEND_EVENTS.PERMISSION_REVOKED, {
      scope: "global" as const,
      userId,
      permissionId,
      revokedByUserId,
    });
  }

  return wasRevoked;
}

export async function hasGlobalPermission(
  userId: string,
  permissionId: string,
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission || permission.scope !== "global") {
    return false;
  }

  if (await isUserAdmin(userId)) {
    return true;
  }

  const result = await db
    .select()
    .from(userGlobalPermissions)
    .where(
      and(
        eq(userGlobalPermissions.userId, userId),
        eq(userGlobalPermissions.permissionId, permissionId),
      ),
    )
    .limit(1);

  return result.length > 0;
}

export async function hasPermission(
  userId: string,
  teamId: string,
  permissionId: string,
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    return false;
  }

  if (permission.scope === "global") {
    return hasGlobalPermission(userId, permissionId);
  }

  if (await isUserAdmin(userId)) {
    return true;
  }

  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    return false;
  }

  const result = await db
    .select()
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.teamId, teamId),
        eq(userPermissions.permissionId, permissionId),
      ),
    )
    .limit(1);

  return result.length > 0;
}

export async function getUserPermissionsForTeam(
  userId: string,
  teamId: string,
): Promise<UserPermission[]> {
  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    return [];
  }

  const permissions = await db
    .select()
    .from(userPermissions)
    .where(
      and(eq(userPermissions.userId, userId), eq(userPermissions.teamId, teamId)),
    );

  return permissions.filter(
    (permission) =>
      getRegisteredPermission(permission.permissionId)?.scope === "team",
  );
}

export async function getUserGlobalPermissions(
  userId: string,
): Promise<UserGlobalPermission[]> {
  const permissions = await db
    .select()
    .from(userGlobalPermissions)
    .where(eq(userGlobalPermissions.userId, userId));

  return permissions.filter(
    (permission) =>
      getRegisteredPermission(permission.permissionId)?.scope === "global",
  );
}

export async function getGrantablePermissions(
  actorUserId: string,
  teamId: string,
): Promise<Permission[]> {
  const allPermissions = getRegisteredPermissionsByScope("team");

  const isAdmin = await isUserAdmin(actorUserId);
  if (isAdmin) {
    return allPermissions;
  }

  if (!(await canAccessTeamPermissions(actorUserId, teamId))) {
    return [];
  }

  const actorPermissions = await db
    .select({ permissionId: userPermissions.permissionId })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, actorUserId),
        eq(userPermissions.teamId, teamId),
      ),
    );

  const actorPermissionIds = new Set(
    actorPermissions.map((actorPermission) => actorPermission.permissionId),
  );

  return allPermissions.filter(
    (permission) =>
      (permission.hasAdminPrerequisite ? isAdmin : true) &&
      permission.prerequisiteActorPermissionIds.every((permissionId) =>
        actorPermissionIds.has(permissionId),
      ),
  );
}

export async function getGrantableGlobalPermissions(
  actorUserId: string,
): Promise<Permission[]> {
  const allPermissions = getRegisteredPermissionsByScope("global");

  const isAdmin = await isUserAdmin(actorUserId);
  if (isAdmin) {
    return allPermissions;
  }

  const actorPermissions = await db
    .select({ permissionId: userGlobalPermissions.permissionId })
    .from(userGlobalPermissions)
    .where(eq(userGlobalPermissions.userId, actorUserId));

  const actorPermissionIds = new Set(
    actorPermissions.map((actorPermission) => actorPermission.permissionId),
  );

  return allPermissions.filter(
    (permission) =>
      (permission.hasAdminPrerequisite ? isAdmin : true) &&
      permission.prerequisiteActorPermissionIds.every((permissionId) =>
        actorPermissionIds.has(permissionId),
      ),
  );
}
