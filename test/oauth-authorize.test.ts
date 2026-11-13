import { databaseTest } from "./db/run";

databaseTest("OAuth authorization requests with PostgreSQL", "./test/db/oauth-authorize.ts");
