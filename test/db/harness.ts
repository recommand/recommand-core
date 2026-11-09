import { afterAll, beforeAll } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const databaseUrl = process.env.CORE_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("CORE_TEST_DATABASE_URL is required");
}
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Use a disposable localhost database ending in _test");
}
// `@recommand/db` connects to this when it is first imported, so import this
// file before anything that uses the database
process.env.DATABASE_URL = databaseUrl;

export const pool = new Pool({ connectionString: databaseUrl });

/**
 * Builds the schema from the `framework` and `core` migrations before the
 * file's tests, and closes the connections after them.
 */
export const useTestDatabase = () => {
  beforeAll(async () => {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    for (const name of ["framework", "core"]) {
      const directory = new URL(`../../../${name}/db/drizzle/`, import.meta.url);
      for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).toSorted()) {
        await pool.query(await readFile(new URL(file, directory), "utf8"));
      }
    }
  });
  afterAll(async () => {
    await pool.end();
    const { db } = await import("@recommand/db");
    await db.$client.end();
  });
};
