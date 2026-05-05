import { emitBackendEvent } from "@core/lib/backend-events";
import { db } from "@recommand/db";
import { ulid } from "ulid";
import { dispatchRulesForEvent } from "./rules";
import type { Tx } from "./db";
import type { EventEnvelope, EventTypeDefinition } from "../../lib/rules/types";

const eventTypeRegistry = new Map<string, EventTypeDefinition>();

export function registerEventType(definition: EventTypeDefinition) {
  if (eventTypeRegistry.has(definition.type)) {
    throw new Error(`Event type already registered: ${definition.type}`);
  }
  eventTypeRegistry.set(definition.type, definition);
}

export function getEventTypeDefinition(type: string) {
  return eventTypeRegistry.get(type);
}

export function listEventTypeDefinitions() {
  return [...eventTypeRegistry.values()];
}

export function clearEventTypeRegistry() {
  eventTypeRegistry.clear();
}

export async function publishEvent(
  type: string,
  args: {
    teamId: string;
    aggregateType: string;
    aggregateId: string;
    correlationId?: string;
    idempotencyKey: string;
    payload: unknown;
    tx?: Tx;
  }
) {
  const definition = getEventTypeDefinition(type);
  if (!definition) {
    throw new Error(`Unknown event type: ${type}`);
  }

  const parsedPayload = definition.payload.parse(args.payload);
  const event: EventEnvelope = {
    id: "ev_" + ulid(),
    type,
    teamId: args.teamId,
    aggregateType: args.aggregateType,
    aggregateId: args.aggregateId,
    correlationId: args.correlationId ?? null,
    idempotencyKey: args.idempotencyKey,
    payload: parsedPayload,
    createdAt: new Date().toISOString(),
  };

  const executor = args.tx ?? db;
  await emitBackendEvent(type, event);
  await dispatchRulesForEvent(event, executor);
}
