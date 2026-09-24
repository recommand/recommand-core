import { addDeadLetter } from "@core/data/event-consumer/dead-letters";
import {
  bootstrappedFloor,
  dispatchEventHandlers,
  listHandlerProjectionBootstraps,
  type ProjectionBootstrap,
} from "@core/data/event-handlers";
import {
  listProjectionBootstrapsForTeam,
  clearProjectionBootstrapFailures,
  listRecordedProjectionKeys,
  recordProjectionBootstrap,
  recordProjectionBootstrapFailure,
} from "@core/data/event-consumer/projection-bootstraps";
import {
  claimCursor,
  CursorLockLostError,
  releaseCursor,
  renewCursor,
  setCursor,
} from "@core/data/event-consumer/cursors";
import {
  getHeadSeq,
  getLatestEventId,
  listEvents,
  listTeamsWithPendingEvents,
} from "@core/data/events";
import { registerServicePrincipal } from "@core/data/service-principals";
import {
  EVENT_ENVELOPE_VERSION,
  eventEnvelopeSchema,
  isSupportedEventEnvelopeVersion,
} from "@core/lib/rules/types";
import type { Logger } from "@recommand/lib/logger";
import { decodeJwt } from "jose";
import { z } from "zod";

const MAX_EVENT_ATTEMPTS = 3;
// The bootstrap loop looks for followed teams that miss a snapshot this often.
const BOOTSTRAP_INTERVAL_MS = 1_000;
const MAX_CONCURRENT_BOOTSTRAPS = 3;
// Wait before the next attempt of a failed bootstrap; the last value repeats.
const BOOTSTRAP_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];
// Renew a held cursor lease this often, well within CURSOR_LOCK_SECONDS.
const CURSOR_HEARTBEAT_MS = 20_000;
// A local tracker checks the log watermark this often and pulls when it moved.
const WATERMARK_INTERVAL_MS = 500;
// Every tracker pulls at least this often. For a local source this catches
// events the watermark missed and retries failed events.
const FULL_PULL_INTERVAL_MS = 5_000;

type LocalEventSource = {
  kind: "local";
};

type RemoteEventSource = {
  kind: "remote";
  baseUrl: string;
  token: string;
  teamId: string;
};

type EventSource = LocalEventSource | RemoteEventSource;

type RemoteEventSourceConfig = {
  url?: string | null;
  token?: string | null;
};

type EventSourceTrackerOptions = {
  source: string;
  consumerId: string;
  remote?: RemoteEventSourceConfig;
  logger: Logger;
  /**
   * Which teams to follow on a local source. Read on every tick, so the set
   * may change at runtime. Absent: every team with pending events. Required
   * when a registered handler declares a bootstrap, because a snapshot of
   * every team is never acceptable. A remote source is pinned to the
   * installation token's team and ignores this.
   */
  listTeams?: () => Promise<string[]>;
};

export type EventSourceClient = {
  source: EventSource;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const remoteEventsResponseSchema = z.object({
  success: z.literal(true),
  events: z.array(eventEnvelopeSchema),
  hasMore: z.boolean(),
});

const remoteHeadResponseSchema = z.object({
  success: z.literal(true),
  seq: z.number().int().min(0),
});

const startedTrackers = new Set<string>();
const startedClients = new Map<string, EventSourceClient>();
// Bootstraps this process has already confirmed, so the bootstrap loop does
// not hit the database for every team once everything is caught up.
const confirmedBootstraps = new Set<string>();

function localSourceBaseUrl() {
  return `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

async function fetchEventSource(
  source: EventSource,
  token: string,
  path: string,
  init: RequestInit = {}
) {
  const baseUrl =
    source.kind === "remote" ? source.baseUrl : localSourceBaseUrl();
  const url = path.startsWith("http")
    ? path
    : new URL(path, `${baseUrl}/`).toString();
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return await fetch(url, {
    ...init,
    headers,
  });
}

function teamIdFromToken(token: string): string {
  const payload = decodeJwt(token);
  if (typeof payload.teamId !== "string" || !payload.teamId) {
    throw new Error("Event source token is missing teamId");
  }
  return payload.teamId;
}

function resolveEventSource(
  remote?: RemoteEventSourceConfig
): EventSource {
  const baseUrl = remote?.url?.replace(/\/$/, "") || "";
  const token = remote?.token || "";
  const provided = [baseUrl, token].filter(Boolean).length;

  if (provided === 2) {
    return { kind: "remote", baseUrl, token, teamId: teamIdFromToken(token) };
  }

  if (provided === 0) {
    return { kind: "local" };
  }

  throw new Error("Remote event source requires url and token");
}

async function readHeadSeq(client: EventSourceClient, teamId: string) {
  if (client.source.kind === "local") {
    return getHeadSeq(teamId);
  }
  const response = await client.fetch("/api/core/events/head");
  if (!response.ok) {
    throw new Error(
      `Remote event source returned ${response.status} ${response.statusText} for head`
    );
  }
  return remoteHeadResponseSchema.parse(await response.json()).seq;
}

type TrackerContext = {
  client: EventSourceClient;
  consumerId: string;
  logger: Logger;
  listTeams?: () => Promise<string[]>;
};

type BootstrapLoopState = {
  inFlight: Set<string>;
  failures: Map<string, { attempts: number; retryAt: number }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function confirmedBootstrapKey(consumerId: string, teamId: string, key: string) {
  return `${consumerId}:${teamId}:${key}`;
}

/**
 * Keep a claimed cursor's lease alive while work runs under it. A lost lease
 * is only logged here; the next write under the lock throws on it.
 */
function holdCursorLease(context: TrackerContext, teamId: string, lockedBy: string) {
  const timer = setInterval(() => {
    renewCursor(teamId, context.consumerId, lockedBy).catch((error) => {
      context.logger.error(
        `Failed to renew the cursor lease for ${teamId}: ${errorMessage(error)}`
      );
    });
  }, CURSOR_HEARTBEAT_MS);
  return () => clearInterval(timer);
}

async function listBootstrapTeamIds(
  context: TrackerContext,
  bootstraps: ProjectionBootstrap[]
) {
  const source = context.client.source;
  if (source.kind === "remote") {
    return [source.teamId];
  }
  if (!context.listTeams) {
    throw new Error(
      `Consumer "${context.consumerId}" registers projection bootstraps (${bootstraps
        .map((bootstrap) => bootstrap.key)
        .join(", ")}) but passes no listTeams to startEventSourceTracker`
    );
  }
  return context.listTeams();
}

/**
 * Take every missing snapshot for one team under the team's cursor lock, so no
 * other node bootstraps or follows the team at the same time. The head is read
 * before the snapshot, so the snapshot is at least that new; events after the
 * head replay on top, events at or below it are skipped. Returns false when
 * another claim holds the cursor.
 */
async function bootstrapTeam(
  context: TrackerContext,
  teamId: string,
  bootstraps: ProjectionBootstrap[]
) {
  const cursor = await claimCursor(teamId, context.consumerId);
  if (!cursor?.lockedBy) {
    return false;
  }

  const lockedBy = cursor.lockedBy;
  const stopLease = holdCursorLease(context, teamId, lockedBy);
  try {
    // Read under the lock: another node may have finished this team since the
    // loop last looked.
    const recorded = await listProjectionBootstrapsForTeam(teamId, context.consumerId);
    for (const bootstrap of bootstraps) {
      const confirmedKey = confirmedBootstrapKey(context.consumerId, teamId, bootstrap.key);
      if (recorded.has(bootstrap.key)) {
        confirmedBootstraps.add(confirmedKey);
        continue;
      }

      const failureKey = {
        teamId,
        consumerId: context.consumerId,
        projectionKey: bootstrap.key,
      };
      await clearProjectionBootstrapFailures(failureKey);
      const headSeq = await readHeadSeq(context.client, teamId);
      let skipped = 0;
      await bootstrap.run({
        teamId,
        source: context.client,
        headSeq,
        reportItemFailure: async (itemId, error) => {
          skipped++;
          await recordProjectionBootstrapFailure({ ...failureKey, itemId, error });
        },
      });
      // Prove the lock is still held right before the record, so a node that
      // took over after a lost lease never has its snapshot overwritten.
      await renewCursor(teamId, context.consumerId, lockedBy);
      await recordProjectionBootstrap({
        teamId,
        consumerId: context.consumerId,
        projectionKey: bootstrap.key,
        asOfSeq: headSeq,
      });
      confirmedBootstraps.add(confirmedKey);
      context.logger.info(
        `Bootstrapped projection "${bootstrap.key}" for ${teamId} at seq ${headSeq}`
      );
      if (skipped > 0) {
        context.logger.error(
          `Projection "${bootstrap.key}" for ${teamId} skipped ${skipped} failed item(s); see event_projection_bootstrap_failures`
        );
      }
    }
    return true;
  } finally {
    stopLease();
    await releaseCursor(teamId, context.consumerId, lockedBy);
  }
}

/**
 * Start the bootstraps of followed teams that miss one, a few at a time and
 * without waiting for them, so a long snapshot never holds back the log tail of
 * other teams. A failed team waits longer before each next attempt.
 */
async function startPendingBootstraps(
  context: TrackerContext,
  state: BootstrapLoopState
) {
  const bootstraps = listHandlerProjectionBootstraps();
  if (bootstraps.length === 0) {
    return;
  }

  const now = Date.now();
  const candidates = (await listBootstrapTeamIds(context, bootstraps)).filter(
    (teamId) =>
      !state.inFlight.has(teamId) &&
      (state.failures.get(teamId)?.retryAt ?? 0) <= now &&
      bootstraps.some(
        (bootstrap) =>
          !confirmedBootstraps.has(
            confirmedBootstrapKey(context.consumerId, teamId, bootstrap.key)
          )
      )
  );
  if (candidates.length === 0) {
    return;
  }

  // Confirm teams bootstrapped before this process started without claiming
  // their cursors.
  const recorded = await listRecordedProjectionKeys(candidates, context.consumerId);
  for (const teamId of candidates) {
    const keys = recorded.get(teamId);
    const missing = bootstraps.filter((bootstrap) => !keys?.has(bootstrap.key));
    for (const bootstrap of bootstraps) {
      if (keys?.has(bootstrap.key)) {
        confirmedBootstraps.add(
          confirmedBootstrapKey(context.consumerId, teamId, bootstrap.key)
        );
      }
    }
    if (missing.length === 0 || state.inFlight.size >= MAX_CONCURRENT_BOOTSTRAPS) {
      continue;
    }

    state.inFlight.add(teamId);
    void (async () => {
      try {
        if (!(await bootstrapTeam(context, teamId, bootstraps))) {
          return;
        }
        state.failures.delete(teamId);
      } catch (error) {
        const attempts = (state.failures.get(teamId)?.attempts ?? 0) + 1;
        const delay =
          BOOTSTRAP_RETRY_DELAYS_MS[
            Math.min(attempts, BOOTSTRAP_RETRY_DELAYS_MS.length) - 1
          ];
        state.failures.set(teamId, { attempts, retryAt: Date.now() + delay });
        context.logger.error(
          `Failed to bootstrap projections for ${teamId} (attempt ${attempts}, next in ${Math.round(delay / 1000)}s): ${errorMessage(error)}`
        );
        return;
      } finally {
        state.inFlight.delete(teamId);
      }

      // Replay what was published during the snapshot now, instead of on the
      // next full pull.
      try {
        await pullTeam(context, teamId);
      } catch (error) {
        context.logger.error(
          `Failed to pull events for ${teamId}: ${errorMessage(error)}`
        );
      }
    })();
  }
}

async function pullEventSource(context: TrackerContext) {
  const source = context.client.source;

  let teamIds: string[];
  if (source.kind === "remote") {
    teamIds = [source.teamId];
  } else {
    teamIds = await listTeamsWithPendingEvents(context.consumerId);
    if (context.listTeams) {
      const followed = new Set(await context.listTeams());
      teamIds = teamIds.filter((teamId) => followed.has(teamId));
    }
  }

  for (const teamId of teamIds) {
    try {
      await pullTeam(context, teamId);
    } catch (error) {
      context.logger.error(
        `Failed to pull events for ${teamId}: ${errorMessage(error)}`
      );
    }
  }
}

/**
 * Run `tick` every `intervalMs` as a timeout chain, not an interval: a slow
 * tick delays the next one instead of overlapping it.
 */
function startLoop(intervalMs: number, tick: () => Promise<void>) {
  const loop = async () => {
    await tick();
    setTimeout(loop, intervalMs);
  };
  setTimeout(loop, intervalMs);
}

export function startEventSourceTracker(options: EventSourceTrackerOptions) {
  const source = resolveEventSource(options.remote);
  const trackerKey = `${options.consumerId}:${options.source}`;

  const existing = startedClients.get(trackerKey);
  if (existing) {
    return existing;
  }

  const clientPromise = (async (): Promise<EventSourceClient> => {
    const token =
      source.kind === "remote"
        ? source.token
        : await registerServicePrincipal(options.consumerId);

    return {
      source,
      fetch: (path, init) => fetchEventSource(source, token, path, init),
    };
  })();

  const client: EventSourceClient = {
    source,
    fetch: async (path, init) => {
      const resolved = await clientPromise;
      return resolved.fetch(path, init);
    },
  };
  startedClients.set(trackerKey, client);

  if (source.kind === "local") {
    options.logger.info(
      `Tracking local "${options.source}" events as "${options.consumerId}"`
    );
  } else {
    options.logger.info(
      `Tracking remote "${options.source}" events from ${source.baseUrl} as "${options.consumerId}"`
    );
  }

  if (process.env.RUN_CRON !== "true") {
    return client;
  }

  if (startedTrackers.has(trackerKey)) {
    return client;
  }
  startedTrackers.add(trackerKey);

  const context: TrackerContext = {
    client,
    consumerId: options.consumerId,
    logger: options.logger,
    listTeams: options.listTeams,
  };

  const bootstrapState: BootstrapLoopState = {
    inFlight: new Set(),
    failures: new Map(),
  };
  startLoop(BOOTSTRAP_INTERVAL_MS, async () => {
    try {
      await startPendingBootstraps(context, bootstrapState);
    } catch (error) {
      options.logger.error(
        `Failed to start "${options.source}" projection bootstraps: ${errorMessage(error)}`
      );
    }
  });

  let lastWatermark: string | null | undefined;
  let lastPullAt = 0;
  startLoop(
    source.kind === "local" ? WATERMARK_INTERVAL_MS : FULL_PULL_INTERVAL_MS,
    async () => {
      try {
        if (source.kind === "local") {
          const watermark = await getLatestEventId();
          const due = Date.now() - lastPullAt >= FULL_PULL_INTERVAL_MS;
          if (!due && watermark === lastWatermark) {
            return;
          }
          lastWatermark = watermark;
        }
        lastPullAt = Date.now();
        await pullEventSource(context);
      } catch (error) {
        options.logger.error(
          `Failed to track "${options.source}" events: ${errorMessage(error)}`
        );
      }
    }
  );
  return client;
}

async function pullTeam(options: TrackerContext, teamId: string) {
  const source = options.client.source;
  const cursor = await claimCursor(teamId, options.consumerId);
  if (!cursor?.lockedBy) {
    return;
  }

  const lockedBy = cursor.lockedBy;
  const stopLease = holdCursorLease(options, teamId, lockedBy);
  let after = cursor.lastSeq;
  let retryCount = cursor.retryCount;
  let hasMore = true;

  try {
    // Replaying onto a missing snapshot would apply events to nothing, so a
    // team is only followed once the bootstrap loop recorded all of them.
    const bootstrappedUpTo = await listProjectionBootstrapsForTeam(
      teamId,
      options.consumerId
    );
    if (
      listHandlerProjectionBootstraps().some(
        (bootstrap) => !bootstrappedUpTo.has(bootstrap.key)
      )
    ) {
      return;
    }

    // When every handler has a snapshot, nothing below the lowest snapshot is
    // ever dispatched. Start there instead of reading and skipping the history,
    // which for a newly followed team with a long log is the whole log.
    const floor = bootstrappedFloor(bootstrappedUpTo);
    if (floor !== undefined && floor > after) {
      await setCursor(teamId, options.consumerId, floor, retryCount, lockedBy);
      after = floor;
    }

    while (hasMore) {
      const page =
        source.kind === "local"
          ? await listEvents(teamId, { after, limit: 50 })
          : await fetchRemoteEvents(source, after);

      if (page.events.length === 0) {
        break;
      }

      for (const event of page.events) {
        if (event.seq === undefined) {
          throw new Error(`Event ${event.id} is missing seq`);
        }

        if (!isSupportedEventEnvelopeVersion(event.envelopeVersion)) {
          options.logger.error(
            `Event ${event.id} uses envelope version ${event.envelopeVersion}, but this consumer reads up to version ${EVENT_ENVELOPE_VERSION}. Holding the cursor at seq ${after}; upgrade the consumer.`
          );
          return;
        }

        try {
          await dispatchEventHandlers(event, options.client, { bootstrappedUpTo });
          after = event.seq;
          retryCount = 0;
          await setCursor(teamId, options.consumerId, after, retryCount, lockedBy);
        } catch (error) {
          if (error instanceof CursorLockLostError) {
            throw error;
          }

          const attempts = retryCount + 1;
          const message = error instanceof Error ? error.message : String(error);

          if (attempts < MAX_EVENT_ATTEMPTS) {
            await setCursor(
              teamId,
              options.consumerId,
              after,
              attempts,
              lockedBy
            );
            options.logger.error(
              `Event ${event.id} failed (attempt ${attempts}/${MAX_EVENT_ATTEMPTS}): ${message}`
            );
            return;
          }

          await addDeadLetter({
            teamId,
            consumerId: options.consumerId,
            event,
            error: message,
            attempts,
          });
          options.logger.error(
            `Event ${event.id} moved to dead letter after ${attempts} attempts: ${message}`
          );
          after = event.seq;
          retryCount = 0;
          await setCursor(teamId, options.consumerId, after, retryCount, lockedBy);
        }
      }

      hasMore = page.hasMore;
    }
  } catch (error) {
    if (error instanceof CursorLockLostError) {
      options.logger.error(
        `Lost cursor lock for ${teamId} while tracking as ${options.consumerId}`
      );
      return;
    }
    throw error;
  } finally {
    stopLease();
    await releaseCursor(teamId, options.consumerId, lockedBy);
  }
}

async function fetchRemoteEvents(source: RemoteEventSource, after: number) {
  const url = new URL("/api/core/events", source.baseUrl);
  url.searchParams.set("after", String(after));
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${source.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Remote event source returned ${response.status} ${response.statusText}`
    );
  }

  return remoteEventsResponseSchema.parse(await response.json());
}
