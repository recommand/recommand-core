import type { RecommandApp } from "@recommand/lib/app";
import { Server } from "@recommand/lib/api";
import { Logger } from "@recommand/lib/logger";
import { db } from "@recommand/db";
import { migrations } from "@recommand/db/schema";
import auth from "api/auth";
import apiKeys from "api/api-keys";
import oauth from "api/oauth";
import onboarding from "./api/onboarding";
import teamMembers from "./api/team-members";
import rules from "./api/rules";
import { initializeRuleCronJobs } from "./data/rules/cron";

let logger: Logger;

const server = new Server();

export async function init(app: RecommandApp, server: Server) {
  logger = new Logger(app);
  logger.info("Initializing core app");
  await initializeRuleCronJobs(logger);
}

server.get("/tasks", async (c) => {
  logger.warn("Tasks are being fetched!");
  return c.json({
    message: `Tasks!!`,
    migrations: await db.select().from(migrations),
  });
});

server.route("/", auth);
server.route("/", teamMembers);
server.route("/", apiKeys);
server.route("/", oauth);
server.route("/", onboarding);
server.route("/v1", rules);

export default server;
