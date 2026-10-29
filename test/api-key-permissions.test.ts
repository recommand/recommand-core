import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.CORE_TEST_DATABASE_URL;

test.skipIf(!databaseUrl)("API-key migration and authorization with PostgreSQL", async () => {
  const url = new URL(databaseUrl!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("CORE_TEST_DATABASE_URL must name a disposable localhost database ending in _test");
  }
  const child = Bun.spawn([process.execPath, "test", "./test/db/api-key-permissions.ts"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exitCode, stdout + stderr).toBe(0);
}, 60_000);
