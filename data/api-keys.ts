import { apiKeys, teams, users } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { addSeconds } from "date-fns";
import { sign } from "@core/lib/jwt";
import { ulid } from "ulid";
import { listOwnerTeamPermissionIds, NotAuthorizedError } from "./permissions";
import {
  hasPrincipalPermission,
  listPrincipalPermissionIds,
  listPrincipalPermissionsForIds,
  setPrincipalPermissions,
  type PermissionWriter,
} from "./principal-permissions";

export type ApiKey = typeof apiKeys.$inferSelect;
export type ApiKeyWithPermissions = ApiKey & { permissionIds: string[] };

export async function getApiKeys(userId: string, teamId: string): Promise<ApiKeyWithPermissions[]> {
    const rows = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.teamId, teamId)));
    const permissionsByKey = await listPrincipalPermissionsForIds(
        "api_key",
        rows.map((row) => row.id),
        teamId
    );
    return rows.map((row) => ({
        ...row,
        permissionIds: permissionsByKey.get(row.id) ?? [],
    }));
}

export async function getApiKey(apiKeyId: string) {
    const res = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId));
    if (res.length === 0) {
        return null;
    }
    return res[0];
}

export type ApiKeyCreationStatus =
    | { permitted: true }
    | { permitted: false; reason: "client_assertion_enabled" | "team_not_found" };

export async function getApiKeyCreationStatus(teamId: string): Promise<ApiKeyCreationStatus> {
    const team = await db.select({ clientAssertionJwks: teams.clientAssertionJwks }).from(teams).where(eq(teams.id, teamId));
    if (team.length === 0) {
        return { permitted: false, reason: "team_not_found" };
    }
    if (team[0].clientAssertionJwks) {
        return { permitted: false, reason: "client_assertion_enabled" };
    }
    return { permitted: true };
}

export async function isApiKeyCreationPermitted(teamId: string) {
    const status = await getApiKeyCreationStatus(teamId);
    return status.permitted;
}

async function attachApiKeyPermissions(input: {
    apiKeyId: string;
    teamId: string;
    userId: string;
    permissionIds?: string[];
    actorApiKeyId?: string;
}, executor: PermissionWriter) {
    const ownerIds = await listOwnerTeamPermissionIds(input.userId, input.teamId);
    const actorKeyIds = input.actorApiKeyId
        ? await listPrincipalPermissionIds("api_key", input.actorApiKeyId, input.teamId)
        : null;
    const permissionIds = input.permissionIds ?? ownerIds.filter((id) => !actorKeyIds || actorKeyIds.includes(id));
    await setPrincipalPermissions({
        principalType: "api_key",
        principalId: input.apiKeyId,
        teamId: input.teamId,
        permissionIds,
        actorUserId: input.userId,
        ownerUserId: input.userId,
        actorApiKeyId: input.actorApiKeyId,
    }, executor);
    return [...new Set(permissionIds)];
}

export async function setApiKeyPermissions(input: {
    apiKeyId: string;
    teamId: string;
    actorUserId: string;
    permissionIds: string[];
    actorApiKeyId?: string;
}) {
    const apiKey = await getApiKey(input.apiKeyId);
    if (!apiKey || apiKey.teamId !== input.teamId) {
        return null;
    }
    if (apiKey.userId !== input.actorUserId) {
        const principal = input.actorApiKeyId
            ? { type: "api_key" as const, apiKeyId: input.actorApiKeyId, ownerUserId: input.actorUserId }
            : { type: "user" as const, userId: input.actorUserId };
        if (!(await hasPrincipalPermission(principal, input.teamId, "core.team.manage"))) {
            throw new NotAuthorizedError("You don't have permission to manage this API key");
        }
    }
    const permissionIds = await setPrincipalPermissions({
        principalType: "api_key",
        principalId: apiKey.id,
        teamId: input.teamId,
        permissionIds: input.permissionIds,
        actorUserId: input.actorUserId,
        ownerUserId: apiKey.userId,
        actorApiKeyId: input.actorApiKeyId,
    });
    return { ...apiKey, permissionIds };
}

export async function getApiKeyPermissionIds(apiKeyId: string, teamId: string) {
    return listPrincipalPermissionIds("api_key", apiKeyId, teamId);
}

export async function createApiKey({
    user,
    teamId,
    name,
    type,
    expiresInSeconds,
    permissionIds,
    actorApiKeyId,
}: {
    user: { id: string; isAdmin: boolean },
    teamId: string,
    name: string,
    type: "basic" | "jwt",
    expiresInSeconds?: number,
    permissionIds?: string[],
    actorApiKeyId?: string,
}) {

    // First check if client assertion is enabled for the team, then we won't allow creating API keys
    const isEnabled = await isApiKeyCreationPermitted(teamId);
    if (!isEnabled) {
        throw new Error("Client assertion is enabled for this team. API key creation is disabled.");
    }

    if (type === "jwt") {
        return await createJwtApiKey({
          user,
          teamId,
          expiresInSeconds,
          name,
          permissionIds,
          actorApiKeyId,
        });
    } else {
        return await createBasicApiKey(user.id, teamId, name, permissionIds, actorApiKeyId);
    }
}

export async function createBasicApiKey(
    userId: string,
    teamId: string,
    name: string,
    permissionIds?: string[],
    actorApiKeyId?: string
) {
    const secret = crypto.randomUUID();
    const readableSecret = "secret_" + secret.replace(/-/g, "");
    const secretHash = await bcrypt.hash(readableSecret, 10);

    return db.transaction(async (tx) => {
        const res = await tx
            .insert(apiKeys)
            .values({ userId, teamId, name, type: "basic", secretHash })
            .returning();

        const attached = await attachApiKeyPermissions({
            apiKeyId: res[0].id,
            teamId,
            userId,
            permissionIds,
            actorApiKeyId,
        }, tx);

        return {
            ...res[0],
            secret: readableSecret,
            permissionIds: attached,
        };
    });
    
}

export async function createJwtApiKey({user, teamId, expiresInSeconds, expirationDate, name, permissionIds, actorApiKeyId}: {
    user: { id: string; isAdmin: boolean },
    teamId: string,
    expiresInSeconds?: number,
    expirationDate?: Date,
    name: string,
    permissionIds?: string[],
    actorApiKeyId?: string,
}) {
    if(!expiresInSeconds && !expirationDate){
        throw new Error("expiresInSeconds or expirationDate must be provided to createJwtApiKey");
    }

    const expires = expirationDate ?? addSeconds(new Date(), expiresInSeconds!);
    const id = "key_" + ulid();
    const jwt = await sign({
        sub: user.id,
        jti: id,
        isAdmin: user.isAdmin,
        teamId,
    }, expires);
    return db.transaction(async (tx) => {
        const res = await tx
            .insert(apiKeys)
            .values({ id, userId: user.id, teamId, name, type: "jwt", secretHash: "", expiresAt: expires })
            .returning();
        const attached = await attachApiKeyPermissions({
            apiKeyId: res[0].id,
            teamId,
            userId: user.id,
            permissionIds,
            actorApiKeyId,
        }, tx);
        return {
            ...res[0],
            jwt,
            permissionIds: attached,
        };
    });
}

export async function checkApiKey(apiKeyId: string, secret: string) {
    const res = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.type, "basic")))
        .innerJoin(users, eq(apiKeys.userId, users.id));

    if (res.length === 0) {
        return null;
    }

    const apiKey = res[0];

    if(!apiKey.api_keys.secretHash){
        return null;
    }

    // Check if the secret is correct
    const isSecretCorrect = await bcrypt.compare(secret, apiKey.api_keys.secretHash);
    if (!isSecretCorrect) {
        return null;
    }

    return {
        user: apiKey.users,
        apiKey: apiKey.api_keys,
    };
}

export async function deleteApiKey(userId: string, teamId: string, apiKeyId: string) {
    return await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId), eq(apiKeys.teamId, teamId)));
}
