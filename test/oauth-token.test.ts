import { databaseTest } from "./db/run";

databaseTest("OAuth token endpoint with PostgreSQL", "./test/db/oauth-token.ts");
