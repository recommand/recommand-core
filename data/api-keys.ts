import { apiKeys, teams, users } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { addSeconds } from "date-fns";
import { sign } from "@core/lib/jwt";
import { ulid } from "ulid";

export type ApiKey = typeof apiKeys.$inferSelect;

export async function getApiKeys(userId: string, teamId: string) {
    return await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.teamId, teamId)));
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

export async function createApiKey({
    user,
    teamId,
    name,
    type,
    expiresInSeconds,
}: {
    user: { id: string; isAdmin: boolean },
    teamId: string,
    name: string,
    type: "basic" | "jwt",
    expiresInSeconds?: number,
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
        });
    } else {
        return await createBasicApiKey(user.id, teamId, name);
    }
}

export async function createBasicApiKey(userId: string, teamId: string, name: string) {
    const secret = crypto.randomUUID();
    const readableSecret = "secret_" + secret.replace(/-/g, "");
    const secretHash = await bcrypt.hash(readableSecret, 10);

    const res = await db
        .insert(apiKeys)
        .values({ userId, teamId, name, type: "basic", secretHash })
        .returning();

    return {
        ...res[0],
        secret: readableSecret,
    };
    
}

export async function createJwtApiKey({user, teamId, expiresInSeconds, expirationDate, name}: {
    user: { id: string; isAdmin: boolean },
    teamId: string,
    expiresInSeconds?: number,
    expirationDate?: Date,
    name: string,
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
    return {
        ...res[0],
        jwt,
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