import { eventCursors } from "@core/db/schema";
import { db } from "@recommand/db";
import { addSeconds } from "date-fns";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { ulid } from "ulid";

export type EventCursor = typeof eventCursors.$inferSelect;

export const CURSOR_LOCK_SECONDS = 60;

export class CursorLockLostError extends Error {
  constructor() {
    super("Cursor lock was lost");
    this.name = "CursorLockLostError";
  }
}

function cursorKey(teamId: string, consumerId: string) {
  return {
    teamId,
    consumerId,
  };
}

export async function getCursor(teamId: string, consumerId: string) {
  const key = cursorKey(teamId, consumerId);
  const [cursor] = await db
    .select()
    .from(eventCursors)
    .where(
      and(
        eq(eventCursors.teamId, key.teamId),
        eq(eventCursors.consumerId, key.consumerId)
      )
    )
    .limit(1);

  return (
    cursor ?? {
      ...key,
      lastSeq: 0,
      retryCount: 0,
      lockedBy: null,
      lockedUntil: null,
      updatedAt: null,
    }
  );
}

export async function claimCursor(teamId: string, consumerId: string) {
  const key = cursorKey(teamId, consumerId);
  await db.insert(eventCursors).values(key).onConflictDoNothing();

  const lockedBy = ulid();
  const [cursor] = await db
    .update(eventCursors)
    .set({
      lockedBy,
      lockedUntil: addSeconds(new Date(), CURSOR_LOCK_SECONDS),
    })
    .where(
      and(
        eq(eventCursors.teamId, key.teamId),
        eq(eventCursors.consumerId, key.consumerId),
        or(
          isNull(eventCursors.lockedUntil),
          lte(eventCursors.lockedUntil, new Date())
        )
      )
    )
    .returning();

  return cursor ?? null;
}

export async function releaseCursor(
  teamId: string,
  consumerId: string,
  lockedBy: string
) {
  const key = cursorKey(teamId, consumerId);
  await db
    .update(eventCursors)
    .set({
      lockedBy: null,
      lockedUntil: null,
    })
    .where(
      and(
        eq(eventCursors.teamId, key.teamId),
        eq(eventCursors.consumerId, key.consumerId),
        eq(eventCursors.lockedBy, lockedBy)
      )
    );
}

export async function setCursor(
  teamId: string,
  consumerId: string,
  lastSeq: number,
  retryCount = 0,
  lockedBy?: string
) {
  const key = cursorKey(teamId, consumerId);

  if (lockedBy) {
    const [cursor] = await db
      .update(eventCursors)
      .set({
        lastSeq,
        retryCount,
        lockedUntil: addSeconds(new Date(), CURSOR_LOCK_SECONDS),
      })
      .where(
        and(
          eq(eventCursors.teamId, key.teamId),
          eq(eventCursors.consumerId, key.consumerId),
          eq(eventCursors.lockedBy, lockedBy)
        )
      )
      .returning();

    if (!cursor) {
      throw new CursorLockLostError();
    }
    return cursor;
  }

  const [cursor] = await db
    .insert(eventCursors)
    .values({
      ...key,
      lastSeq,
      retryCount,
    })
    .onConflictDoUpdate({
      target: [eventCursors.teamId, eventCursors.consumerId],
      set: { lastSeq, retryCount },
    })
    .returning();

  return cursor;
}
