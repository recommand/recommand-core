import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

// The tests that run core against a real PostgreSQL. They skip themselves
// unless CORE_TEST_DATABASE_URL points at a disposable database. To run them:
//
//   docker run -d --rm --name core-test -e POSTGRES_PASSWORD=core \
//     -e POSTGRES_DB=core_test -p 127.0.0.1:5492:5432 postgres:16-alpine
//   CORE_TEST_DATABASE_URL=postgres://postgres:core@127.0.0.1:5492/core_test bun run test:db
//   docker stop core-test
//
// Import this file before any module that uses the database: it points the
// database module at the test database. Unit tests never connect, so without
// a test database any URL will do.

export const testDatabaseUrl = process.env.CORE_TEST_DATABASE_URL;
process.env.DATABASE_URL = testDatabaseUrl ?? "postgres://unit-tests@localhost:1/unused";
process.env.JWT_SECRET ??= "core-database-tests-only";

const packagesDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * An empty database with the framework's and core's current schema. Refused
 * unless it is a local database whose name ends in `_test`: it drops everything.
 */
export async function connectTestDatabase(): Promise<Pool> {
  const url = new URL(testDatabaseUrl ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("Use a disposable database on localhost whose name ends in _test");
  }
  const pool = new Pool({ connectionString: testDatabaseUrl });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  for (const name of ["framework", "core"]) {
    const directory = join(packagesDirectory, name, "db", "drizzle");
    for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
      await pool.query(await readFile(join(directory, file), "utf-8"));
    }
  }
  return pool;
}
