import { installations, installationTokens } from "@core/db/schema";
import { sign } from "@core/lib/jwt";
import { DEFAULT_INSTALLATION_PERMISSION_IDS } from "@core/lib/permissions";
import { getRegisteredPermission } from "@core/lib/permissions";
import { db } from "@recommand/db";
import { and, eq, inArray } from "drizzle-orm";
import { addSeconds } from "date-fns";
import { ulid } from "ulid";
import {
  listPrincipalPermissionsForIds,
  setPrincipalPermissions,
} from "./principal-permissions";

export type Installation = typeof installations.$inferSelect;
export type InstallationToken = typeof installationTokens.$inferSelect;
export type PublicInstallationToken = Pick<
  InstallationToken,
  "id" | "expiresAt" | "createdAt"
>;
export type PublicInstallation = Installation & {
  tokens: PublicInstallationToken[];
  permissionIds: string[];
};

export const INSTALLATION_TOKEN_TYPE = "installation";

function toPublicToken(token: InstallationToken): PublicInstallationToken {
  return {
    id: token.id,
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
  };
}

async function issueJwt(installation: Installation, token: InstallationToken) {
  return await sign(
    {
      sub: installation.id,
      jti: token.id,
      teamId: installation.teamId,
      tokenType: INSTALLATION_TOKEN_TYPE,
    },
    token.expiresAt
  );
}

export async function getInstallation(id: string) {
  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.id, id))
    .limit(1);
  return installation ?? null;
}

export async function getInstallationToken(id: string) {
  const [token] = await db
    .select()
    .from(installationTokens)
    .where(eq(installationTokens.id, id))
    .limit(1);
  return token ?? null;
}

export async function getValidInstallation(sub: string, jti: string, teamId: string) {
  const installation = await getInstallation(sub);
  const token = await getInstallationToken(jti);
  if (
    !installation ||
    !token ||
    installation.teamId !== teamId ||
    token.installationId !== installation.id ||
    token.expiresAt <= new Date()
  ) {
    return null;
  }
  return installation;
}

export async function listInstallations(teamId: string): Promise<PublicInstallation[]> {
  const rows = await db
    .select()
    .from(installations)
    .where(eq(installations.teamId, teamId));
  if (rows.length === 0) {
    return [];
  }

  const tokens = await db
    .select()
    .from(installationTokens)
    .where(
      inArray(
        installationTokens.installationId,
        rows.map((row) => row.id)
      )
    );

  const permissionsByInstallation = await listPrincipalPermissionsForIds(
    "installation",
    rows.map((row) => row.id),
    teamId
  );

  return rows.map((installation) => ({
    ...installation,
    tokens: tokens
      .filter((token) => token.installationId === installation.id)
      .map(toPublicToken),
    permissionIds: permissionsByInstallation.get(installation.id) ?? [],
  }));
}

function defaultInstallationPermissionIds() {
  return DEFAULT_INSTALLATION_PERMISSION_IDS.filter((permissionId) =>
    Boolean(getRegisteredPermission(permissionId))
  );
}

export async function setInstallationPermissions(input: {
  teamId: string;
  installationId: string;
  actorUserId: string;
  permissionIds: string[];
}) {
  const installation = await getInstallation(input.installationId);
  if (!installation || installation.teamId !== input.teamId) {
    return null;
  }
  const permissionIds = await setPrincipalPermissions({
    principalType: "installation",
    principalId: installation.id,
    teamId: input.teamId,
    permissionIds: input.permissionIds,
    actorUserId: input.actorUserId,
  });
  return { installation, permissionIds };
}

export async function createInstallation({
  teamId,
  name,
  expiresInSeconds,
  actorUserId,
  permissionIds,
}: {
  teamId: string;
  name: string;
  expiresInSeconds: number;
  actorUserId: string;
  permissionIds?: string[];
}) {
  const created = await db.transaction(async (tx) => {
    const id = "ins_" + ulid();
    const [installation] = await tx
      .insert(installations)
      .values({ id, teamId, name })
      .returning();
    const [token] = await tx
      .insert(installationTokens)
      .values({
        id: "it_" + ulid(),
        installationId: installation.id,
        expiresAt: addSeconds(new Date(), expiresInSeconds),
      })
      .returning();

    return {
      installation,
      token: {
        ...toPublicToken(token),
        jwt: await issueJwt(installation, token),
      },
    };
  });

  const grantedPermissionIds = await setPrincipalPermissions({
    principalType: "installation",
    principalId: created.installation.id,
    teamId,
    permissionIds: permissionIds ?? defaultInstallationPermissionIds(),
    actorUserId,
  });

  return {
    ...created,
    permissionIds: grantedPermissionIds,
  };
}

export async function createInstallationToken({
  teamId,
  installationId,
  expiresInSeconds,
}: {
  teamId: string;
  installationId: string;
  expiresInSeconds: number;
}) {
  const installation = await getInstallation(installationId);
  if (!installation || installation.teamId !== teamId) {
    return null;
  }

  const [token] = await db
    .insert(installationTokens)
    .values({
      id: "it_" + ulid(),
      installationId: installation.id,
      expiresAt: addSeconds(new Date(), expiresInSeconds),
    })
    .returning();

  return {
    installation,
    token: {
      ...toPublicToken(token),
      jwt: await issueJwt(installation, token),
    },
  };
}

export async function deleteInstallationToken(
  teamId: string,
  installationId: string,
  tokenId: string
) {
  const installation = await getInstallation(installationId);
  if (!installation || installation.teamId !== teamId) {
    return 0;
  }

  const deleted = await db
    .delete(installationTokens)
    .where(
      and(
        eq(installationTokens.id, tokenId),
        eq(installationTokens.installationId, installationId)
      )
    )
    .returning({ id: installationTokens.id });

  return deleted.length;
}

export async function deleteInstallation(teamId: string, installationId: string) {
  return await db
    .delete(installations)
    .where(
      and(eq(installations.id, installationId), eq(installations.teamId, teamId))
    );
}
