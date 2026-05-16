import { Cron } from "croner";
import { Logger } from "@recommand/lib/logger";
import { processRuleDeliveries } from "./deliveries";

let initialized = false;

export async function initializeRuleCronJobs(logger: Logger) {
  if (initialized || process.env.RUN_CRON !== "true") {
    return;
  }

  initialized = true;

  new Cron("*/10 * * * * *", { name: "rules.deliveries" }, async () => {
    try {
      await processRuleDeliveries();
    } catch (error) {
      logger.error(
        `Failed to process rule deliveries: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  processRuleDeliveries().catch((error) => {
    logger.error(
      `Failed to process rule deliveries immediately: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}
