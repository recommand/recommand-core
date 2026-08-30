import { eventDeadLetters } from "@core/db/schema";
import type { EventEnvelope } from "@core/lib/rules/types";
import { db } from "@recommand/db";
import { normalizeStreamId } from "./events";

export type EventDeadLetter = typeof eventDeadLetters.$inferSelect;

export async function addDeadLetter(input: {
  teamId: string;
  consumerId: string;
  event: EventEnvelope;
  error: string;
  attempts: number;
}) {
  if (input.event.seq === undefined) {
    throw new Error("Dead letter requires event.seq");
  }

  const [row] = await db
    .insert(eventDeadLetters)
    .values({
      teamId: input.teamId,
      consumerId: input.consumerId,
      streamId: normalizeStreamId(input.event.streamId),
      eventId: input.event.id,
      seq: input.event.seq,
      type: input.event.type,
      eventOccurredAt: new Date(input.event.createdAt),
      event: input.event,
      error: input.error,
      attempts: input.attempts,
    })
    .onConflictDoNothing({
      target: [
        eventDeadLetters.teamId,
        eventDeadLetters.consumerId,
        eventDeadLetters.streamId,
        eventDeadLetters.eventId,
      ],
    })
    .returning();

  return row ?? null;
}