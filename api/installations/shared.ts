import { z } from "zod";

export const teamIdParamSchema = z.object({
  teamId: z.string(),
});

export const createInstallationBodySchema = z.object({
  name: z.string().min(1),
  expiresInSeconds: z.number().int().min(1),
  permissionIds: z.array(z.string()).optional(),
});

export const setPermissionsBodySchema = z.object({
  permissionIds: z.array(z.string()),
});

export const createInstallationTokenBodySchema = z.object({
  expiresInSeconds: z.number().int().min(1),
});

export const installationIdParamSchema = z.object({
  teamId: z.string(),
  installationId: z.string(),
});

export const installationTokenParamSchema = z.object({
  teamId: z.string(),
  installationId: z.string(),
  tokenId: z.string(),
});
