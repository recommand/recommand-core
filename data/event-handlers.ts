import type { EventEnvelope } from "@core/lib/rules/types";
import type { EventSourceClient } from "@core/data/event-sources";

export type EventHandler = (
  event: EventEnvelope,
  source: EventSourceClient
) => void | Promise<void>;

export type EventHandlerRegistration = {
  type: string;
  handler: EventHandler;
};

const handlers: EventHandlerRegistration[] = [];

export function registerEventHandler(registration: EventHandlerRegistration) {
  handlers.push(registration);
}

export function listEventHandlers() {
  return [...handlers];
}

export function clearEventHandlerRegistry() {
  handlers.length = 0;
}

export async function dispatchEventHandlers(
  event: EventEnvelope,
  source: EventSourceClient
) {
  for (const registration of handlers) {
    if (registration.type !== "*" && registration.type !== event.type) {
      continue;
    }
    await registration.handler(event, source);
  }
}
