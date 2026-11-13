import { principalPermissions } from "@core/db/schema";
import type { PermissionScope } from "@core/lib/permissions";
import { getDelegablePermission, getRegisteredPermission } from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  getGrantablePermissions,
  hasPermission,
  InvalidPermissionScopeError,
  listMemberTeamPermissionIds,
  listOwnerTeamPermissionIds,
  NotAuthorizedError,
  PermissionNotRegisteredError,
} from "./permissions";

export type ActorPrincipal =
  | { type: "user"; userId: string }
  | { type: "api_key"; apiKeyId: string; ownerUserId: string }
  // `permissionIds`: what the grant holds in the team, when the request already loaded it
  | { type: "oauth_grant"; grantId: string; permissionIds?: string[]; userId: string };

export const hasPrincipalPermission = async (
  principal: ActorPrincipal,
  teamId: string,
  permissionId: string
): Promise<boolean> => {
  if (principal.type === "user") {
    return hasPermission(principal.userId, teamId, permissionId);
  }

  if (principal.type === "api_key") {
    if (getRegisteredPermission(permissionId)?.scope !== "team") {
      return false;
    }
    const granted = await hasStoredPrincipalPermission(
      "api_key",
      principal.apiKeyId,
      teamId,
      permissionId
    );
    if (!granted) {
      return false;
    }
    return hasPermission(principal.ownerUserId, teamId, permissionId);
  }

  if (principal.type === "oauth_grant") {
    // Also refuses a permission whose delegation changed after the consent
    if (!getDelegablePermission(permissionId)) {
      return false;
    }
    const granted = principal.permissionIds
      ? principal.permissionIds.includes(permissionId)
      : await hasStoredPrincipalPermission("oauth_grant", principal.grantId, teamId, permissionId);
    if (!granted) {
      return false;
    }
    // Unlike an API key, never through the admin bypass: an OAuth token carries
    // at most what its user holds as a member of the team
    return (await listMemberTeamPermissionIds(principal.userId, teamId)).includes(permissionId);
  }

  throw new Error("Invalid principal type");
};

export type PrincipalType = "api_key" | "oauth_grant";
export type PrincipalPermission = typeof principalPermissions.$inferSelect;

// A key's permissions are stored in its own team and apply wherever the key may
// act: its own team, or, for an admin's key, any team
const principalTeamCondition = (principalType: PrincipalType, teamId: string) =>
  principalType === "api_key" ? undefined : eq(principalPermissions.teamId, teamId);

export const listPrincipalPermissionIds = async (
  principalType: PrincipalType,
  principalId: string,
  teamId: string
): Promise<string[]> => {
  const rows = await db
    .select({ permissionId: principalPermissions.permissionId })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.principalId, principalId),
        principalTeamCondition(principalType, teamId)
      )
    );

  return rows.map((row) => row.permissionId);
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
  teamId: string,
  permissionId: string
): Promise<boolean> => {
  const [row] = await db
    .select({ permissionId: principalPermissions.permissionId })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.principalId, principalId),
        principalTeamCondition(principalType, teamId),
        eq(principalPermissions.permissionId, permissionId)
      )
    )
    .limit(1);

  return Boolean(row);
};

export type PermissionWriter = Pick<typeof db, "delete" | "insert">;

export const setPrincipalPermissions = async (input: {
  principalType: PrincipalType;
  principalId: string;
  teamId: string;
  permissionIds: string[];
  actorUserId: string;
  ownerUserId?: string;
  expectedScope?: PermissionScope;
  actorApiKeyId?: string;
}, executor?: PermissionWriter): Promise<string[]> => {
  const uniqueIds = [...new Set(input.permissionIds)];
  // Holding a permission is enough to put it on your own key; giving it to someone else's needs the right to grant it
  const grantableIds = input.ownerUserId === input.actorUserId
    ? null
    : new Set((await getGrantablePermissions(input.actorUserId, input.teamId)).map((permission) => permission.id));
  const ownerIds = input.ownerUserId
    ? new Set(await listOwnerTeamPermissionIds(input.ownerUserId, input.teamId))
    : null;

  const actorKeyIds = input.actorApiKeyId
    ? new Set(await listPrincipalPermissionIds("api_key", input.actorApiKeyId, input.teamId))
    : null;

  const expectedScope = input.expectedScope ?? "team";
  uniqueIds.forEach((permissionId) => {
    const permission = getRegisteredPermission(permissionId);
    if (!permission) {
      throw new PermissionNotRegisteredError(permissionId);
    }
    if (permission.scope !== expectedScope) {
      throw new InvalidPermissionScopeError(
        permissionId,
        expectedScope,
        permission.scope ?? "team"
      );
    }
    if (actorKeyIds && !actorKeyIds.has(permissionId)) {
      throw new NotAuthorizedError("API keys cannot grant permissions they do not have");
    }
    if (grantableIds && !grantableIds.has(permissionId)) {
      throw new NotAuthorizedError(
        "You don't have permission to grant this permission"
      );
    }
    if (ownerIds && !ownerIds.has(permissionId)) {
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
