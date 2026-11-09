import type { RecommandApp } from "@recommand/lib/app";
import { Server } from "@recommand/lib/api";
import { Logger } from "@recommand/lib/logger";
import auth from "api/auth";
import apiKeys from "api/api-keys";
import oauth from "api/oauth";
import onboarding from "./api/onboarding";
import teamMembers from "./api/team-members";
import permissions from "./api/permissions";
import translations from "./api/translations";
import languages from "./api/languages";
import account from "./api/account";
import teamLogo from "./api/team-logo";
import manifest from "./api/manifest";
import rules from "./api/rules";
import { initializeApiKeyCronJobs } from "./data/api-key-cron";
import { initializeIdempotencyKeyCronJobs } from "./data/idempotency-keys-cron";
import { initializeRuleCronJobs } from "./data/rules/cron";
import { forbidFraming } from "./lib/oauth/frame";

let logger: Logger;

const server = new Server();

export async function init(app: RecommandApp, server: Server) {
  logger = new Logger(app);
  logger.info("Initializing core app");
  await initializeIdempotencyKeyCronJobs(logger);
  await initializeRuleCronJobs(logger);
  initializeApiKeyCronJobs(logger);
  // The consent screen is a page of the app, served after the packages initialize
  server.use("/oauth/authorize", forbidFraming);
}

server.route("/", auth);
server.route("/", teamMembers);
server.route("/", apiKeys);
server.route("/", oauth);
server.route("/", onboarding);
server.route("/", permissions);
server.route("/", translations);
server.route("/", languages);
server.route("/", account);
server.route("/", teamLogo);
server.route("/", manifest);
server.route("/", rules);

export default server;
