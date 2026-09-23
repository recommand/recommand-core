import type { EventEnvelope } from "@core/lib/rules/types";
import type { EventSourceClient } from "@core/data/event-sources";

export type EventHandler = (
  event: EventEnvelope,
  source: EventSourceClient
) => void | Promise<void>;

export type ProjectionBootstrapContext = {
  teamId: string;
  source: EventSourceClient;
  /** The log position the snapshot is taken at. Events after it replay on top. */
  headSeq: number;
};

/**
 * How a projection catches up with state that predates its events: pull a
 * current-state snapshot through the event source, then follow the log tail.
 * The tracker runs it once per team and skips events at or below the recorded
 * head for handlers that share this key.
 */
export type ProjectionBootstrap = {
  key: string;
  run: (context: ProjectionBootstrapContext) => Promise<void>;
};

export type EventHandlerRegistration = {
  type: string;
  handler: EventHandler;
  bootstrap?: ProjectionBootstrap;
};

const handlers: EventHandlerRegistration[] = [];

export function registerEventHandler(registration: EventHandlerRegistration) {
  handlers.push(registration);
}

export function listEventHandlers() {
  return [...handlers];
}

/** Every distinct bootstrap, keyed once even when several handlers share it. */
export function listHandlerProjectionBootstraps(): ProjectionBootstrap[] {
  const byKey = new Map<string, ProjectionBootstrap>();
  for (const registration of handlers) {
    if (registration.bootstrap && !byKey.has(registration.bootstrap.key)) {
      byKey.set(registration.bootstrap.key, registration.bootstrap);
    }
  }
  return [...byKey.values()];
}

/**
 * The log position every handler would skip up to: the lowest recorded snapshot
 * among the projection keys, but only when every registered handler declares a
 * bootstrap and every key has a record. Otherwise undefined, because some
 * handler still needs the events below it.
 */
export function bootstrappedFloor(
  bootstrappedUpTo: Map<string, number>
): number | undefined {
  if (handlers.length === 0) {
    return undefined;
  }
  let floor: number | undefined;
  for (const registration of handlers) {
    if (!registration.bootstrap) {
      return undefined;
    }
    const asOfSeq = bootstrappedUpTo.get(registration.bootstrap.key);
    if (asOfSeq === undefined) {
      return undefined;
    }
    floor = floor === undefined ? asOfSeq : Math.min(floor, asOfSeq);
  }
  return floor;
}

export function clearEventHandlerRegistry() {
  handlers.length = 0;
}

export async function dispatchEventHandlers(
  event: EventEnvelope,
  source: EventSourceClient,
  options: {
    /** Per projection key: the snapshot position; events at or below it are skipped. */
    bootstrappedUpTo?: Map<string, number>;
  } = {}
) {
  for (const registration of handlers) {
    if (registration.type !== "*" && registration.type !== event.type) {
      continue;
    }
    const asOfSeq = registration.bootstrap
      ? options.bootstrappedUpTo?.get(registration.bootstrap.key)
      : undefined;
    if (
      asOfSeq !== undefined &&
      event.seq !== undefined &&
      event.seq <= asOfSeq
    ) {
      continue;
    }
    await registration.handler(event, source);
  }
}
