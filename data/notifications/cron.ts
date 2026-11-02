import { Cron } from "croner";
import type { Logger } from "@recommand/lib/logger";
import { processNotificationDeliveries } from "./deliveries";

let initialized = false;

export function initializeNotificationCronJobs(logger: Logger) {
  if (initialized || process.env.RUN_CRON !== "true") {
    return;
  }
  initialized = true;

  const run = async () => {
    try {
      await processNotificationDeliveries();
    } catch (error) {
      logger.error(
        `Failed to process notification deliveries: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  // Every 10 seconds
  new Cron("*/10 * * * * *", { name: "notifications.deliveries", protect: true }, run);
  void run();
}
