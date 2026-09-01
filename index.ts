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
import installations from "./api/installations";
import events from "./api/events";
import { initializeEventDataOffloadCronJobs } from "./data/event-data-offload";
import { initializeRuleCronJobs } from "./data/rules/cron";

let logger: Logger;

const server = new Server();

export async function init(app: RecommandApp, server: Server) {
  logger = new Logger(app);
  logger.info("Initializing core app");
  await initializeRuleCronJobs(logger);
  await initializeEventDataOffloadCronJobs(logger);
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
server.route("/", installations);
server.route("/", events);

export default server;
