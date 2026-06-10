import { S3Client } from "bun";
import "dotenv/config";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function isS3Enabled(): boolean {
  return process.env.S3FS_ENABLED === "true";
}

export function isTeamLogoEnabled(): boolean {
  return isS3Enabled() && process.env.S3FS_TEAM_LOGO_ENABLED === "true";
}

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      accessKeyId: getEnv("S3FS_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("S3FS_SECRET_ACCESS_KEY"),
      endpoint: getEnv("S3FS_ENDPOINT"),
      bucket: getEnv("S3FS_BUCKET"),
      region: process.env.S3FS_REGION,
    });
  }
  return _s3;
}

export async function uploadFile(
  key: string,
  data: string | Uint8Array | ArrayBuffer | Blob | Response,
  options?: { type?: string; contentDisposition?: string },
) {
  await getS3().write(key, data, options);
  return key;
}

export async function downloadFile(key: string) {
  return getS3().file(key);
}

export function presignUrl(
  key: string,
  options?: { expiresIn?: number; method?: "GET" | "PUT"; type?: string },
) {
  return getS3().presign(key, {
    expiresIn: options?.expiresIn ?? 60 * 60 * 24,
    method: options?.method,
    type: options?.type,
  });
}

export async function deleteFile(key: string) {
  await getS3().delete(key);
}

export async function fileExists(key: string) {
  return getS3().exists(key);
}
