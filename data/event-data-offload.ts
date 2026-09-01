import {
  EVENT_DATA_INLINE_LIMIT_BYTES,
  EVENT_DATA_S3_TIMEOUT_MS,
  eventDataS3Key,
} from "@core/data/event-data";
import { events } from "@core/db/schema";
import { isS3Enabled, uploadFile } from "@core/lib/s3";
import { withTimeout } from "@core/lib/timeout";
import { db } from "@recommand/db";
import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { Cron } from "croner";
import type { Logger } from "@recommand/lib/logger";

// How long a large snapshot may stay inline before the worker moves it to S3.
// Short on purpose: consumers read events within seconds, and anything above
// the inline limit travels by reference anyway, so there is no reason to let
// multi-megabyte rows accumulate in the events table.
const RETENTION_MS = 15 * 60 * 1000;
// Abort a run after this many consecutive failures (e.g. S3 unavailable) so we
// don't churn through the whole table during an outage; the next run retries.
const MAX_CONSECUTIVE_FAILURES = 25;
// A claim older than this is treated as abandoned (the worker that made it
// likely crashed mid-upload) and the row becomes eligible to offload again.
// Must comfortably exceed the upload timeout so a slow-but-alive worker is not
// reclaimed out from under itself.
const CLAIM_STALE_MS = 15 * 60 * 1000;

// Prevents overlapping runs within this process. Multiple *instances* may
// safely drain in parallel — they claim distinct rows via dataOffloadClaimedAt
// — but a single process only needs one loop.
let isRunning = false;

export function isEventDataOffloadEnabled(): boolean {
  return process.env.CORE_EVENT_DATA_OFFLOAD_ENABLED === "true";
}

/**
 * Offload the snapshots of events larger than the inline limit to S3, keeping
 * the events table slim. Events are processed strictly one at a time: each
 * snapshot is uploaded and then its row is updated in its own statement, so an
 * interruption at worst leaves a row to be retried (the S3 key is
 * deterministic, making re-upload idempotent).
 */
export async function offloadLargeEventData(logger: Logger): Promise<void> {
  if (!isEventDataOffloadEnabled() || !isS3Enabled()) {
    return;
  }
  if (isRunning) {
    logger.info("Event data offload already running; skipping this trigger");
    return;
  }
  isRunning = true;
  try {
    await drainLargeEventData(logger);
  } finally {
    isRunning = false;
  }
}

async function drainLargeEventData(logger: Logger): Promise<void> {
  let processed = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  while (true) {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    // A claim made before this moment is considered abandoned, so the row is
    // eligible again. Recomputed each iteration since a full drain can run long.
    const claimStaleBefore = new Date(Date.now() - CLAIM_STALE_MS);

    // No transaction wraps the upload: the claim, upload, and finalize each
    // grab and release a connection on their own, so no DB connection (or row
    // lock) is ever held during the S3 upload. The whole operation is
    // idempotent — the S3 key is deterministic and the finalize is guarded on
    // dataLocation still being "db" — so a crash mid-way just re-runs the row
    // after the claim goes stale.
    const [event] = await db
      .select({
        id: events.id,
        teamId: events.teamId,
        createdAt: events.createdAt,
        data: events.data,
      })
      .from(events)
      .where(
        and(
          eq(events.dataLocation, "db"),
          gt(events.dataSizeBytes, EVENT_DATA_INLINE_LIMIT_BYTES),
          lt(events.createdAt, cutoff),
          or(
            isNull(events.dataOffloadClaimedAt),
            lt(events.dataOffloadClaimedAt, claimStaleBefore)
          )
        )
      )
      .orderBy(asc(events.createdAt))
      .limit(1);

    if (!event) {
      break;
    }

    // Claim the row with a compare-and-swap update: if another instance
    // claimed this same row between our SELECT and now, our update matches
    // zero rows and we move on to the next one.
    const claimed = await db
      .update(events)
      .set({ dataOffloadClaimedAt: new Date() })
      .where(
        and(
          eq(events.id, event.id),
          eq(events.dataLocation, "db"),
          or(
            isNull(events.dataOffloadClaimedAt),
            lt(events.dataOffloadClaimedAt, claimStaleBefore)
          )
        )
      )
      .returning({ id: events.id });

    if (claimed.length === 0) {
      continue; // another worker claimed it first
    }

    try {
      const s3Key = eventDataS3Key(event);

      await withTimeout(
        uploadFile(s3Key, JSON.stringify(event.data), {
          type: "application/json",
        }),
        EVENT_DATA_S3_TIMEOUT_MS,
        `Event data upload for ${event.id}`
      );

      await db
        .update(events)
        .set({
          data: null,
          dataLocation: "s3",
          dataS3Key: s3Key,
        })
        // Guard on dataLocation so a second offloader that raced on the same
        // row simply no-ops instead of writing twice.
        .where(and(eq(events.id, event.id), eq(events.dataLocation, "db")));

      processed++;
      consecutiveFailures = 0;
    } catch (error) {
      // The row keeps its fresh claim, so this run won't retry it; a later run
      // will once the claim goes stale.
      failed++;
      consecutiveFailures++;
      logger.error(
        `Failed to offload data for event ${event.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Aborting event data offload run after ${consecutiveFailures} consecutive failures`
        );
        break;
      }
    }
  }

  if (processed > 0 || failed > 0) {
    logger.info(
      `Event data offload run complete: ${processed} offloaded, ${failed} failed`
    );
  }
}

export async function initializeEventDataOffloadCronJobs(
  logger: Logger
): Promise<void> {
  if (
    process.env.RUN_CRON !== "true" ||
    !isEventDataOffloadEnabled() ||
    !isS3Enabled()
  ) {
    return;
  }

  logger.info("Initializing event data offload cron job");

  // Hourly, offset from the top of the hour to avoid piling onto other jobs.
  new Cron("30 * * * *", { name: "core.event-data-offload" }, async () => {
    try {
      await offloadLargeEventData(logger);
    } catch (error) {
      logger.error(
        `Failed to run core.event-data-offload: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
