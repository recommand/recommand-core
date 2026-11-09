import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.CORE_TEST_DATABASE_URL;

/**
 * Runs a database test file in a process of its own, since it points the app at
 * the test database before loading it. Skipped without `CORE_TEST_DATABASE_URL`.
 */
export const databaseTest = (name: string, file: string) => {
  test.skipIf(!databaseUrl)(name, async () => {
    const child = Bun.spawn([process.execPath, "test", file], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stderr: "pipe",
      stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode, stdout + stderr).toBe(0);
  }, 60_000);
};
