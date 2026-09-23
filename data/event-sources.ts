import { addDeadLetter } from "@core/data/event-dead-letters";
import {
  bootstrappedFloor,
  dispatchEventHandlers,
  listHandlerProjectionBootstraps,
  type ProjectionBootstrap,
} from "@core/data/event-handlers";
import {
  listProjectionBootstrapsForTeam,
  recordProjectionBootstrap,
} from "@core/data/event-projection-bootstraps";
import {
  claimCursor,
  CursorLockLostError,
  releaseCursor,
  setCursor,
} from "@core/data/event-cursors";
import { getHeadSeq, listEvents, listTeamsWithPendingEvents } from "@core/data/events";
import { registerServicePrincipal } from "@core/data/service-principals";
import {
  EVENT_ENVELOPE_VERSION,
  eventEnvelopeSchema,
  isSupportedEventEnvelopeVersion,
} from "@core/lib/rules/types";
import type { Logger } from "@recommand/lib/logger";
import { Cron } from "croner";
import { decodeJwt } from "jose";
import { z } from "zod";

const MAX_EVENT_ATTEMPTS = 3;

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
// Bootstraps this process has already confirmed, so a tick does not hit the
// database for every team once everything is caught up.
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

/**
 * Bring every projection that declares a bootstrap up to date for one team.
 * The head is read before the snapshot, so the snapshot is at least that new;
 * events after the head replay on top, events at or below it are skipped.
 */
async function runProjectionBootstraps(
  options: {
    client: EventSourceClient;
    consumerId: string;
    logger: Logger;
  },
  teamId: string,
  bootstraps: ProjectionBootstrap[]
) {
  const pending = bootstraps.filter(
    (bootstrap) =>
      !confirmedBootstraps.has(`${options.consumerId}:${teamId}:${bootstrap.key}`)
  );
  if (pending.length === 0) {
    return;
  }

  const recorded = await listProjectionBootstrapsForTeam(teamId, options.consumerId);
  for (const bootstrap of pending) {
    const confirmedKey = `${options.consumerId}:${teamId}:${bootstrap.key}`;
    if (recorded.has(bootstrap.key)) {
      confirmedBootstraps.add(confirmedKey);
      continue;
    }

    try {
      const headSeq = await readHeadSeq(options.client, teamId);
      await bootstrap.run({ teamId, source: options.client, headSeq });
      await recordProjectionBootstrap({
        teamId,
        consumerId: options.consumerId,
        projectionKey: bootstrap.key,
        asOfSeq: headSeq,
      });
      confirmedBootstraps.add(confirmedKey);
      options.logger.info(
        `Bootstrapped projection "${bootstrap.key}" for ${teamId} at seq ${headSeq}`
      );
    } catch (error) {
      options.logger.error(
        `Failed to bootstrap projection "${bootstrap.key}" for ${teamId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function pullEventSource(options: {
  client: EventSourceClient;
  consumerId: string;
  logger: Logger;
  listTeams?: () => Promise<string[]>;
}) {
  const source = options.client.source;

  const bootstraps = listHandlerProjectionBootstraps();
  if (bootstraps.length > 0) {
    // Followed teams, not only those with pending events: a team whose data
    // predates its events has nothing pending and would never be visited.
    let bootstrapTeamIds: string[];
    if (source.kind === "remote") {
      bootstrapTeamIds = [source.teamId];
    } else if (options.listTeams) {
      bootstrapTeamIds = await options.listTeams();
    } else {
      throw new Error(
        `Consumer "${options.consumerId}" registers projection bootstraps (${bootstraps
          .map((bootstrap) => bootstrap.key)
          .join(", ")}) but passes no listTeams to startEventSourceTracker`
      );
    }
    for (const teamId of bootstrapTeamIds) {
      await runProjectionBootstraps(options, teamId, bootstraps);
    }
  }

  let teamIds: string[];
  if (source.kind === "remote") {
    teamIds = [source.teamId];
  } else {
    teamIds = await listTeamsWithPendingEvents(options.consumerId);
    if (options.listTeams) {
      const followed = new Set(await options.listTeams());
      teamIds = teamIds.filter((teamId) => followed.has(teamId));
    }
  }

  for (const teamId of teamIds) {
    try {
      await pullTeam(options, teamId);
    } catch (error) {
      options.logger.error(
        `Failed to pull events for ${teamId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
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

  const run = async () => {
    try {
      await pullEventSource({
        client,
        consumerId: options.consumerId,
        logger: options.logger,
        listTeams: options.listTeams,
      });
    } catch (error) {
      options.logger.error(
        `Failed to track "${options.source}" events: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  new Cron(
    "*/5 * * * * *",
    { name: `core.event-source.${trackerKey}`, protect: true },
    run
  );
  return client;
}

async function pullTeam(
  options: {
    client: EventSourceClient;
    consumerId: string;
    logger: Logger;
  },
  teamId: string
) {
  const source = options.client.source;
  const cursor = await claimCursor(teamId, options.consumerId);
  if (!cursor?.lockedBy) {
    return;
  }

  const lockedBy = cursor.lockedBy;
  const bootstrappedUpTo = await listProjectionBootstrapsForTeam(
    teamId,
    options.consumerId
  );
  let after = cursor.lastSeq;
  let retryCount = cursor.retryCount;
  let hasMore = true;

  try {
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
