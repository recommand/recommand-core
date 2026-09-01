import { appendEvent, toEventEnvelope } from "@core/data/events";
import { emitBackendEvent } from "@core/lib/backend-events";
import { db } from "@recommand/db";
import { ulid } from "ulid";
import { dispatchRulesForEvent } from "./rules";
import type { Tx } from "./db";
import type { EventTypeDefinition } from "../../lib/rules/types";

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
    streamId?: string | null;
    aggregateType: string;
    aggregateId: string;
    correlationId?: string;
    idempotencyKey: string;
    payload: unknown;
    data?: unknown;
    tx?: Tx;
  }
) {
  const definition = getEventTypeDefinition(type);
  if (!definition) {
    throw new Error(`Unknown event type: ${type}`);
  }

  const parsedPayload = definition.payload.parse(args.payload);
  if (definition.dataSchema && args.data === undefined) {
    throw new Error(`Event type ${type} requires a data snapshot`);
  }
  if (!definition.dataSchema && args.data !== undefined) {
    throw new Error(`Event type ${type} does not declare a data schema`);
  }
  const parsedData = definition.dataSchema
    ? definition.dataSchema.parse(args.data)
    : undefined;
  const eventId = "ev_" + ulid();
  const createdAt = new Date();

  const publish = async (tx: Tx) => {
    const { event: stored, inserted } = await appendEvent(
      {
        id: eventId,
        teamId: args.teamId,
        streamId: args.streamId,
        type,
        aggregateType: args.aggregateType,
        aggregateId: args.aggregateId,
        correlationId: args.correlationId ?? null,
        idempotencyKey: args.idempotencyKey,
        payload: parsedPayload,
        data: parsedData,
        createdAt,
      },
      tx
    );

    const event = toEventEnvelope(stored);
    if (!inserted) {
      return event;
    }

    await emitBackendEvent(type, event);
    await dispatchRulesForEvent(event, tx);
    return event;
  };

  if (args.tx) {
    return await publish(args.tx);
  }

  return await db.transaction(async (tx) => publish(tx as Tx));
}
