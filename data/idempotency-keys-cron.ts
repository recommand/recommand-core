import type { Logger } from "@recommand/lib/logger";
import { Cron } from "croner";
import { purgeExpiredIdempotencyKeys } from "./idempotency-keys";

let initialized = false;

export const initializeIdempotencyKeyCronJobs = async (logger: Logger) => {
  if (initialized || process.env.RUN_CRON !== "true") {
    return;
  }

  initialized = true;

  new Cron("0 * * * *", { name: "idempotency-keys.purge" }, async () => {
    try {
      await purgeExpiredIdempotencyKeys();
    } catch (error) {
      logger.error(
        `Failed to purge expired idempotency keys: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
};
