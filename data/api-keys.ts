import { apiKeys, teams, users } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { addSeconds } from "date-fns";
import { sign } from "@core/lib/jwt";
import { ulid } from "ulid";
import { listOwnerTeamPermissionIds } from "./permissions";
import {
  listPrincipalPermissionIds,
  listPrincipalPermissionsForIds,
  setPrincipalPermissions,
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
}) {
    const permissionIds =
        input.permissionIds ??
        (await listOwnerTeamPermissionIds(input.userId, input.teamId));
    await setPrincipalPermissions({
        principalType: "api_key",
        principalId: input.apiKeyId,
        teamId: input.teamId,
        permissionIds,
        actorUserId: input.userId,
        ownerUserId: input.userId,
    });
    return permissionIds;
}

export async function setApiKeyPermissions(input: {
    apiKeyId: string;
    teamId: string;
    actorUserId: string;
    permissionIds: string[];
}) {
    const apiKey = await getApiKey(input.apiKeyId);
    if (!apiKey || apiKey.teamId !== input.teamId) {
        return null;
    }
    const permissionIds = await setPrincipalPermissions({
        principalType: "api_key",
        principalId: apiKey.id,
        teamId: input.teamId,
        permissionIds: input.permissionIds,
        actorUserId: input.actorUserId,
        ownerUserId: apiKey.userId,
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
}: {
    user: { id: string; isAdmin: boolean },
    teamId: string,
    name: string,
    type: "basic" | "jwt",
    expiresInSeconds?: number,
    permissionIds?: string[],
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
        });
    } else {
        return await createBasicApiKey(user.id, teamId, name, permissionIds);
    }
}

export async function createBasicApiKey(
    userId: string,
    teamId: string,
    name: string,
    permissionIds?: string[]
) {
    const secret = crypto.randomUUID();
    const readableSecret = "secret_" + secret.replace(/-/g, "");
    const secretHash = await bcrypt.hash(readableSecret, 10);

    const res = await db
        .insert(apiKeys)
        .values({ userId, teamId, name, type: "basic", secretHash })
        .returning();

    const attached = await attachApiKeyPermissions({
        apiKeyId: res[0].id,
        teamId,
        userId,
        permissionIds,
    });

    return {
        ...res[0],
        secret: readableSecret,
        permissionIds: attached,
    };
    
}

export async function createJwtApiKey({user, teamId, expiresInSeconds, expirationDate, name, permissionIds}: {
    user: { id: string; isAdmin: boolean },
    teamId: string,
    expiresInSeconds?: number,
    expirationDate?: Date,
    name: string,
    permissionIds?: string[],
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
    const res = await db
        .insert(apiKeys)
        .values({ id, userId: user.id, teamId, name, type: "jwt", secretHash: "", expiresAt: expires })
        .returning();
    const attached = await attachApiKeyPermissions({
        apiKeyId: res[0].id,
        teamId,
        userId: user.id,
        permissionIds,
    });
    return {
        ...res[0],
        jwt,
        permissionIds: attached,
    };
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