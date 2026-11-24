import { principalPermissions } from "@core/db/schema";
import { getRegisteredPermission } from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  hasPermission,
  InvalidPermissionScopeError,
  listOwnerTeamPermissionIds,
  NotAuthorizedError,
  PermissionNotRegisteredError,
} from "./permissions";

export type ActorPrincipal =
  | { type: "user"; userId: string }
  | { apiKeyId: string; ownerIsAdmin: boolean; ownerUserId: string; teamId: string; type: "api_key" };

export const hasPrincipalPermission = async (
  principal: ActorPrincipal,
  teamId: string,
  permissionId: string
): Promise<boolean> => {
  if (principal.type === "user") {
    return hasPermission(principal.userId, teamId, permissionId);
  }

  if (principal.type === "api_key") {
    // A key acts in its own team; only an admin's key reaches other teams
    if (getRegisteredPermission(permissionId)?.scope !== "team" || (principal.teamId !== teamId && !principal.ownerIsAdmin)) {
      return false;
    }

    const granted = await hasStoredPrincipalPermission(
      "api_key",
      principal.apiKeyId,
      permissionId
    );
    if (!granted) {
      return false;
    }

    return hasPermission(principal.ownerUserId, teamId, permissionId);
  }

  throw new Error("Invalid principal type");
};

export type PrincipalType = "api_key";
export type PrincipalPermission = typeof principalPermissions.$inferSelect;

// A key's permissions are stored in its own team and apply wherever the key may
// act: its own team, or, for an admin's key, any team
export const listPrincipalPermissionIds = async (
  principalType: PrincipalType,
  principalId: string
): Promise<string[]> => {
  const rows = await db
    .select({ permissionId: principalPermissions.permissionId })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.principalId, principalId)
      )
    );

  return rows.map((row) => row.permissionId);
};

/**
 * The team permissions an API key holds in its own team, sorted by id: the ones `hasPrincipalPermission` grants it
 * there, each stored on the key and still held by its owner.
 */
export const listPrincipalTeamPermissionIds = async (principal: Extract<ActorPrincipal, { type: "api_key" }>): Promise<string[]> => {
  const ownerIds = new Set(await listOwnerTeamPermissionIds(principal.ownerUserId, principal.teamId));
  const keyIds = await listPrincipalPermissionIds("api_key", principal.apiKeyId);

  return keyIds.filter((permissionId) => ownerIds.has(permissionId)).toSorted();
};

export const listPrincipalPermissionsForIds = async (
  principalType: PrincipalType,
  principalIds: string[],
  teamId: string
): Promise<Map<string, string[]>> => {
  if (principalIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      permissionId: principalPermissions.permissionId,
      principalId: principalPermissions.principalId,
    })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.teamId, teamId),
        inArray(principalPermissions.principalId, principalIds)
      )
    );

  return new Map(
    principalIds.map((id) => [
      id,
      rows.filter((row) => row.principalId === id).map((row) => row.permissionId),
    ])
  );
};

export const hasStoredPrincipalPermission = async (
  principalType: PrincipalType,
  principalId: string,
  permissionId: string
): Promise<boolean> => {
  const [row] = await db
    .select({ permissionId: principalPermissions.permissionId })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.principalId, principalId),
        eq(principalPermissions.permissionId, permissionId)
      )
    )
    .limit(1);

  return Boolean(row);
};

export type PermissionWriter = Pick<typeof db, "delete" | "insert">;

export const setPrincipalPermissions = async (input: {
  actorApiKeyId?: string;
  actorUserId: string;
  ownerUserId: string;
  permissionIds: string[];
  principalId: string;
  principalType: PrincipalType;
  teamId: string;
}, executor?: PermissionWriter): Promise<string[]> => {
  const uniqueIds = [...new Set(input.permissionIds)];
  const ownerIds = new Set(await listOwnerTeamPermissionIds(input.ownerUserId, input.teamId));
  const actorKeyIds = input.actorApiKeyId
    ? new Set(await listPrincipalPermissionIds("api_key", input.actorApiKeyId))
    : null;

  uniqueIds.forEach((permissionId) => {
    const permission = getRegisteredPermission(permissionId);
    if (!permission) {
      throw new PermissionNotRegisteredError(permissionId);
    }

    if (permission.scope !== "team") {
      throw new InvalidPermissionScopeError(
        permissionId,
        "team",
        permission.scope ?? "team"
      );
    }

    if (actorKeyIds && !actorKeyIds.has(permissionId)) {
      throw new NotAuthorizedError("API keys cannot grant permissions they do not have");
    }

    if (!ownerIds.has(permissionId)) {
      throw new NotAuthorizedError(
        "API keys can only have a subset of the creating user's permissions"
      );
    }
  });

  const write = async (tx: PermissionWriter) => {
    await tx
      .delete(principalPermissions)
      .where(
        and(
          eq(principalPermissions.principalType, input.principalType),
          eq(principalPermissions.principalId, input.principalId),
          eq(principalPermissions.teamId, input.teamId)
        )
      );

    if (uniqueIds.length === 0) {
      return [];
    }

    await tx.insert(principalPermissions).values(
      uniqueIds.map((permissionId) => ({
        grantedByUserId: input.actorUserId,
        permissionId,
        principalId: input.principalId,
        principalType: input.principalType,
        teamId: input.teamId,
      }))
    );

    return uniqueIds;
  };

  return executor ? write(executor) : db.transaction(write);
};
