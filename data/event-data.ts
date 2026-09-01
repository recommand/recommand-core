import { downloadTextFile } from "@core/lib/s3";
import type { EventEnvelope } from "@core/lib/rules/types";

// Upper bound on any single S3 request before we give up on it, so a stalled
// connection never blocks a worker or a consumer indefinitely.
export const EVENT_DATA_S3_TIMEOUT_MS = 60_000;

// Snapshots at or below this serialized size stay inline: in the events row
// forever, and embedded in the envelope on the wire. Larger snapshots are
// offloaded to S3 by the background worker and always travel by reference, so
// a page of events stays bounded.
export const EVENT_DATA_INLINE_LIMIT_BYTES = 64 * 1024;

// Root of all offloaded event snapshots. Every object lives under its team's
// prefix, so all of a team's snapshots can be removed by prefix without
// enumerating keys from the database.
export const EVENT_DATA_S3_ROOT = "event-data";

export function teamEventDataS3Prefix(teamId: string): string {
  return `${EVENT_DATA_S3_ROOT}/${teamId}/`;
}

export function eventDataS3Key(event: {
  id: string;
  teamId: string;
  createdAt: Date;
}): string {
  const d = event.createdAt;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${teamEventDataS3Prefix(event.teamId)}${yyyy}/${mm}/${dd}/${event.id}.json`;
}

export function eventDataApiPath(teamId: string, eventId: string): string {
  return `/api/core/${teamId}/events/${eventId}/data`;
}

export function serializedEventDataSize(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

type EventDataLocator = {
  id: string;
  teamId: string;
  data: unknown;
  dataLocation: "none" | "db" | "s3";
  dataS3Key: string | null;
  dataSizeBytes: number | null;
};

// Resolve a snapshot from wherever it currently lives: in the events row or in
// S3. Returns undefined when the event carries no snapshot.
export async function resolveEventData(
  event: EventDataLocator
): Promise<unknown> {
  switch (event.dataLocation) {
    case "db":
      return event.data;
    case "s3": {
      if (!event.dataS3Key) {
        throw new Error(`Offloaded event ${event.id} is missing its dataS3Key`);
      }
      const json = await downloadTextFile(event.dataS3Key, {
        timeoutMs: EVENT_DATA_S3_TIMEOUT_MS,
      });
      return JSON.parse(json);
    }
    case "none":
      return undefined;
  }
}

// The envelope's data fields for an event row: the snapshot itself when it is
// small enough for the wire, a reference otherwise, nothing when there is none.
export function eventEnvelopeDataFields(
  event: EventDataLocator
): Pick<EventEnvelope, "data" | "dataRef"> {
  if (event.dataLocation === "none") {
    return {};
  }
  if (
    event.dataLocation === "db" &&
    (event.dataSizeBytes ?? 0) <= EVENT_DATA_INLINE_LIMIT_BYTES
  ) {
    return { data: event.data };
  }
  return { dataRef: eventDataApiPath(event.teamId, event.id) };
}
