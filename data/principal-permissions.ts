import { principalPermissions } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  getGrantablePermissions,
  hasPermission,
  listOwnerTeamPermissionIds,
  InvalidPermissionScopeError,
  NotAuthorizedError,
  PermissionNotRegisteredError,
} from "./permissions";
import {
  getRegisteredPermission,
  type PermissionScope,
} from "@core/lib/permissions";
import { serviceHasPermission } from "./service-principals";

export type ActorPrincipal =
  | { type: "user"; userId: string }
  | { type: "api_key"; apiKeyId: string; ownerUserId: string }
  | { type: "installation"; installationId: string }
  | { type: "service"; serviceId: string };

export async function hasPrincipalPermission(
  principal: ActorPrincipal,
  teamId: string,
  permissionId: string
): Promise<boolean> {
  if (principal.type === "user") {
    return hasPermission(principal.userId, teamId, permissionId);
  }

  if (principal.type === "api_key") {
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

  if (principal.type === "installation") {
    return hasStoredPrincipalPermission(
      "installation",
      principal.installationId,
      teamId,
      permissionId
    );
  }

  if (principal.type === "service") {
    return serviceHasPermission();
  }

  throw new Error("Invalid principal type");
}

export type PrincipalType = "api_key" | "installation";
export type PrincipalPermission = typeof principalPermissions.$inferSelect;

export async function listPrincipalPermissionIds(
  principalType: PrincipalType,
  principalId: string,
  teamId: string
): Promise<string[]> {
  const rows = await db
    .select({ permissionId: principalPermissions.permissionId })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.principalId, principalId),
        eq(principalPermissions.teamId, teamId)
      )
    );

  return rows.map((row) => row.permissionId);
}

export async function listPrincipalPermissionsForIds(
  principalType: PrincipalType,
  principalIds: string[],
  teamId: string
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const id of principalIds) {
    result.set(id, []);
  }
  if (principalIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      principalId: principalPermissions.principalId,
      permissionId: principalPermissions.permissionId,
    })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.teamId, teamId),
        inArray(principalPermissions.principalId, principalIds)
      )
    );

  for (const row of rows) {
    const list = result.get(row.principalId) ?? [];
    list.push(row.permissionId);
    result.set(row.principalId, list);
  }

  return result;
}

export async function hasStoredPrincipalPermission(
  principalType: PrincipalType,
  principalId: string,
  teamId: string,
  permissionId: string
): Promise<boolean> {
  const [row] = await db
    .select({ permissionId: principalPermissions.permissionId })
    .from(principalPermissions)
    .where(
      and(
        eq(principalPermissions.principalType, principalType),
        eq(principalPermissions.principalId, principalId),
        eq(principalPermissions.teamId, teamId),
        eq(principalPermissions.permissionId, permissionId)
      )
    )
    .limit(1);

  return Boolean(row);
}

export async function setPrincipalPermissions(input: {
  principalType: PrincipalType;
  principalId: string;
  teamId: string;
  permissionIds: string[];
  actorUserId: string;
  ownerUserId?: string;
  expectedScope?: PermissionScope;
}): Promise<string[]> {
  const uniqueIds = [...new Set(input.permissionIds)];
  const grantable = await getGrantablePermissions(input.actorUserId, input.teamId);
  const grantableIds = new Set(grantable.map((permission) => permission.id));
  const ownerIds = input.ownerUserId
    ? new Set(await listOwnerTeamPermissionIds(input.ownerUserId, input.teamId))
    : null;

  for (const permissionId of uniqueIds) {
    const permission = getRegisteredPermission(permissionId);
    if (!permission) {
      throw new PermissionNotRegisteredError(permissionId);
    }
    if (permission.scope !== (input.expectedScope ?? "team")) {
      throw new InvalidPermissionScopeError(
        permissionId,
        input.expectedScope ?? "team",
        permission.scope ?? "team"
      );
    }
    if (!grantableIds.has(permissionId)) {
      throw new NotAuthorizedError(
        "You don't have permission to grant this permission"
      );
    }
    if (ownerIds && !ownerIds.has(permissionId)) {
      throw new NotAuthorizedError(
        "API keys can only have a subset of the creating user's permissions"
      );
    }
  }

  return await db.transaction(async (tx) => {
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
        principalType: input.principalType,
        principalId: input.principalId,
        teamId: input.teamId,
        permissionId,
        grantedByUserId: input.actorUserId,
      }))
    );

    return uniqueIds;
  });
}
