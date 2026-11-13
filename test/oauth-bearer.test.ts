import { databaseTest } from "./db/run";

databaseTest("OAuth access tokens on requests with PostgreSQL", "./test/db/oauth-bearer.ts");
