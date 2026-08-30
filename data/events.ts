import { eventCursors, events } from "@core/db/schema";
import {
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
} from "@core/lib/rules/types";
import { db } from "@recommand/db";
import { and, asc, eq, gt, max, sql } from "drizzle-orm";
import type { Tx } from "./rules/db";

export type EventRow = typeof events.$inferSelect;

export function normalizeStreamId(streamId?: string | null) {
  return streamId ?? "";
}

export function toEventEnvelope(row: EventRow): EventEnvelope {
  return {
    envelopeVersion: EVENT_ENVELOPE_VERSION,
    id: row.id,
    type: row.type,
    teamId: row.teamId,
    streamId: row.streamId,
    seq: row.seq,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function appendEvent(
  event: {
    id: string;
    teamId: string;
    streamId?: string | null;
    type: string;
    aggregateType: string;
    aggregateId: string;
    correlationId?: string | null;
    idempotencyKey: string;
    payload: unknown;
    createdAt: Date;
  },
  tx: Tx
): Promise<{ event: EventRow; inserted: boolean }> {
  const streamId = normalizeStreamId(event.streamId);

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${event.teamId}))`);

  const [existing] = await tx
    .select()
    .from(events)
    .where(
      and(
        eq(events.teamId, event.teamId),
        eq(events.idempotencyKey, event.idempotencyKey)
      )
    )
    .limit(1);

  if (existing) {
    return { event: existing, inserted: false };
  }

  const [maxRow] = await tx
    .select({ maxSeq: max(events.seq) })
    .from(events)
    .where(eq(events.teamId, event.teamId));

  const seq = (maxRow?.maxSeq ?? 0) + 1;

  const [inserted] = await tx
    .insert(events)
    .values({
      id: event.id,
      seq,
      teamId: event.teamId,
      streamId,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId ?? null,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      createdAt: event.createdAt,
    })
    .returning();

  return { event: inserted, inserted: true };
}

export async function listEvents(
  teamId: string,
  options: {
    after?: number;
    streamId?: string | null;
    limit?: number;
  } = {}
) {
  const after = options.after ?? 0;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const streamId = options.streamId;

  const filters = [eq(events.teamId, teamId), gt(events.seq, after)];
  if (streamId !== undefined && streamId !== null) {
    filters.push(eq(events.streamId, streamId));
  }

  const rows = await db
    .select()
    .from(events)
    .where(and(...filters))
    .orderBy(asc(events.seq))
    .limit(limit);

  return {
    events: rows.map(toEventEnvelope),
    hasMore: rows.length === limit,
  };
}

export async function listTeamsWithPendingEvents(consumerId: string) {
  const maxSeqByTeam = db
    .select({
      teamId: events.teamId,
      maxSeq: max(events.seq).as("max_seq"),
    })
    .from(events)
    .groupBy(events.teamId)
    .as("max_seq_by_team");

  const rows = await db
    .select({ teamId: maxSeqByTeam.teamId })
    .from(maxSeqByTeam)
    .leftJoin(
      eventCursors,
      and(
        eq(eventCursors.teamId, maxSeqByTeam.teamId),
        eq(eventCursors.consumerId, consumerId)
      )
    )
    .where(sql`${maxSeqByTeam.maxSeq} > coalesce(${eventCursors.lastSeq}, 0)`);

  return rows.map((row) => row.teamId);
}
