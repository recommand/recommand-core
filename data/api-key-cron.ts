import type { Logger } from "@recommand/lib/logger";
import { Cron } from "croner";
import { deleteExpiredApiKeyPermissions } from "./api-keys";

let initialized = false;

/** Deletes the permissions of expired keys once a day. */
export const initializeApiKeyCronJobs = (logger: Logger) => {
  if (initialized || process.env.RUN_CRON !== "true") {
    return;
  }

  initialized = true;

  new Cron("0 3 * * *", { name: "core.api-keys.expired-permissions" }, async () => {
    try {
      const keyCount = await deleteExpiredApiKeyPermissions();
      logger.info(`Deleted the permissions of ${keyCount} expired API keys`);
    } catch (error) {
      logger.error(
        `Failed to delete the permissions of expired API keys: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
};
