import { userPermissions, users, teamMembers } from "@core/db/schema";
import { emitBackendEvent, CORE_BACKEND_EVENTS } from "@core/lib/backend-events";
import { getRegisteredPermission, getRegisteredPermissions, type Permission } from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";

export type UserPermission = typeof userPermissions.$inferSelect;

export class PermissionNotRegisteredError extends Error {
  constructor(permissionId: string) {
    super(`Permission "${permissionId}" is not registered`);
    this.name = "PermissionNotRegisteredError";
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
  teamId: string
): Promise<boolean> {
  if (await isUserAdmin(userId)) {
    return true;
  }

  // Check if user is a member of the team
  const membership = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.teamId, teamId)
      )
    )
    .limit(1);

  return membership.length > 0;
}

async function canActorModifyPermission(
  actorUserId: string,
  teamId: string,
  permission: Permission
): Promise<boolean> {
  // Check if actor can access the team
  if (!await canAccessTeamPermissions(actorUserId, teamId)) {
    return false;
  }

  // If actor is admin, they can modify any permission
  const isAdmin = await isUserAdmin(actorUserId);
  if (isAdmin) {
    return true;
  }
  if (permission.hasAdminPrerequisite && !isAdmin) {
    return false;
  }

  // Check if actor has all prerequisite permissions
  const actorPermissions = await db
    .select({ permissionId: userPermissions.permissionId })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, actorUserId),
        eq(userPermissions.teamId, teamId),
        inArray(userPermissions.permissionId, permission.prerequisiteActorPermissionIds)
      )
    );

  const actorPermissionIds = new Set(actorPermissions.map((p) => p.permissionId));
  return permission.prerequisiteActorPermissionIds.every((id) => actorPermissionIds.has(id));
}

export async function grantPermission(
  userId: string,
  teamId: string,
  permissionId: string,
  grantedByUserId: string
): Promise<UserPermission> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    throw new PermissionNotRegisteredError(permissionId);
  }

  // Check if target user can have permissions for this team
  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    throw new NotAuthorizedError(
      "User must be a member of the team to be granted permissions"
    );
  }

  // Check if actor can grant this permission
  const canModify = await canActorModifyPermission(grantedByUserId, teamId, permission);
  if (!canModify) {
    throw new NotAuthorizedError(
      "You don't have permission to grant this permission"
    );
  }

  const [result] = await db
    .insert(userPermissions)
    .values({ userId, teamId, permissionId, grantedByUserId })
    .onConflictDoNothing()
    .returning();

  if (result) {
    await emitBackendEvent(CORE_BACKEND_EVENTS.PERMISSION_GRANTED, {
      userId,
      teamId,
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
  revokedByUserId: string
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    throw new PermissionNotRegisteredError(permissionId);
  }

  // Check if target user can have permissions for this team
  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    throw new NotAuthorizedError(
      "User must be a member of the team to have permissions revoked"
    );
  }

  // Check if actor can revoke this permission
  const canModify = await canActorModifyPermission(revokedByUserId, teamId, permission);
  if (!canModify) {
    throw new NotAuthorizedError(
      "You don't have permission to revoke this permission"
    );
  }

  const result = await db
    .delete(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.teamId, teamId),
        eq(userPermissions.permissionId, permissionId)
      )
    );

  const wasRevoked = (result.rowCount ?? 0) > 0;

  if (wasRevoked) {
    await emitBackendEvent(CORE_BACKEND_EVENTS.PERMISSION_REVOKED, {
      userId,
      teamId,
      permissionId,
      revokedByUserId,
    });
  }

  return wasRevoked;
}

export async function hasPermission(
  userId: string,
  teamId: string,
  permissionId: string
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    return false;
  }

  // If user is admin, they have all permissions
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
        eq(userPermissions.permissionId, permissionId)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Checks if a user has the given permission in any of their teams.
 * More efficient than checking each team individually.
 */
export async function hasPermissionInAnyTeam(
  userId: string,
  permissionId: string
): Promise<boolean> {
  const permission = getRegisteredPermission(permissionId);
  if (!permission) {
    return false;
  }

  if (await isUserAdmin(userId)) {
    return true;
  }

  const result = await db
    .select()
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.permissionId, permissionId)
      )
    )
    .limit(1);

  return result.length > 0;
}

export async function getUserPermissionsForTeam(
  userId: string,
  teamId: string
): Promise<UserPermission[]> {
  const canAccess = await canAccessTeamPermissions(userId, teamId);
  if (!canAccess) {
    return [];
  }

  return await db
    .select()
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.teamId, teamId)
      )
    );
}

export async function getGrantablePermissions(
  actorUserId: string,
  teamId: string
): Promise<Permission[]> {
  const allPermissions = getRegisteredPermissions();

  // Check if actor is an admin
  const isAdmin = await isUserAdmin(actorUserId);
  if (isAdmin) {
    return allPermissions;
  }

  // Check if actor can access the team at all
  if (!await canAccessTeamPermissions(actorUserId, teamId)) {
    return [];
  }

  // Get all permissions the actor has for this team
  const actorPermissions = await db
    .select({ permissionId: userPermissions.permissionId })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.userId, actorUserId),
        eq(userPermissions.teamId, teamId)
      )
    );

  const actorPermissionIds = new Set(actorPermissions.map((p) => p.permissionId));

  // Filter to only permissions where actor has all prerequisites
  return allPermissions.filter((permission) =>
    (permission.hasAdminPrerequisite ? isAdmin : true) &&
    permission.prerequisiteActorPermissionIds.every((id) => actorPermissionIds.has(id))
  );
}
