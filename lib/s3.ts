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

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number | undefined,
  label: string
): Promise<T> {
  if (ms === undefined) {
    return promise;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function isTransientS3Error(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error.message.toLowerCase();
  return (
    code === "ConnectionClosed" ||
    code === "ECONNRESET" ||
    message.includes("socket connection was closed") ||
    message.includes("connection closed") ||
    message.includes("econnreset")
  );
}

async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientS3Error(error) || attempt === attempts - 1) {
        throw error;
      }
      await Bun.sleep(100 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function downloadTextFile(
  key: string,
  options?: { timeoutMs?: number }
) {
  return await withTransientRetry(() =>
    withTimeout(getS3().file(key).text(), options?.timeoutMs, `Download ${key}`)
  );
}

export async function downloadBinaryFile(
  key: string,
  options?: { timeoutMs?: number }
) {
  return Buffer.from(
    await withTransientRetry(() =>
      withTimeout(
        getS3().file(key).arrayBuffer(),
        options?.timeoutMs,
        `Download ${key}`
      )
    )
  );
}

export async function deleteFile(key: string) {
  await getS3().delete(key);
}

export async function listFiles(prefix: string, options?: { maxKeys?: number }) {
  return getS3().list({ prefix, maxKeys: options?.maxKeys });
}

export async function fileExists(key: string) {
  return getS3().exists(key);
}
