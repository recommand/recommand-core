import type { Logger } from "@recommand/lib/logger";
import { Cron } from "croner";
import { deleteExpiredAuthorizationCodes } from "./oauth-authorization-codes";
import { deleteUnusedClients } from "./oauth-clients";

let initialized = false;

/** Deletes expired authorization codes and OAuth clients nobody uses once a day. */
export const initializeOAuthClientCronJobs = (logger: Logger) => {
  if (initialized || process.env.RUN_CRON !== "true") {
    return;
  }

  initialized = true;

  new Cron("15 3 * * *", { name: "core.oauth.unused-clients" }, async () => {
    try {
      // Old codes would otherwise keep their clients
      await deleteExpiredAuthorizationCodes();
      const clientCount = await deleteUnusedClients();
      logger.info(`Deleted ${clientCount} unused OAuth clients`);
    } catch (error) {
      logger.error(`Failed to delete unused OAuth clients: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
};
