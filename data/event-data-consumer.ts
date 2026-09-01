import type { EventSourceClient } from "@core/data/event-sources";
import type { EventEnvelope } from "@core/lib/rules/types";

// Consumer-side resolution of an envelope's snapshot. This is the only part of
// the event data machinery a consumer needs: it works from the envelope alone,
// through the consumer's event source client, so it behaves identically for
// local and remote sources and never touches the events table or S3 directly.
export async function resolveEventEnvelopeData(
  event: EventEnvelope,
  source: EventSourceClient
): Promise<unknown> {
  if (event.data !== undefined) {
    return event.data;
  }
  if (!event.dataRef) {
    return undefined;
  }

  const response = await source.fetch(event.dataRef);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch data for event ${event.id}: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as { data?: unknown };
  return body.data;
}
