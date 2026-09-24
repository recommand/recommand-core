import { db } from "@recommand/db";
import {
  eventProjectionBootstrapFailures,
  eventProjectionBootstraps,
} from "@core/db/schema";
import { listHandlerProjectionBootstraps } from "@core/data/event-handlers";
import { and, eq, inArray } from "drizzle-orm";

export async function listProjectionBootstrapsForTeam(
  teamId: string,
  consumerId: string
): Promise<Map<string, number>> {
  const rows = await db
    .select()
    .from(eventProjectionBootstraps)
    .where(
      and(
        eq(eventProjectionBootstraps.teamId, teamId),
        eq(eventProjectionBootstraps.consumerId, consumerId)
      )
    );
  return new Map(rows.map((row) => [row.projectionKey, row.asOfSeq]));
}

/** Forget the skipped items of a projection, before it bootstraps again. */
export async function clearProjectionBootstrapFailures(input: {
  teamId: string;
  consumerId: string;
  projectionKey: string;
}): Promise<void> {
  await db
    .delete(eventProjectionBootstrapFailures)
    .where(
      and(
        eq(eventProjectionBootstrapFailures.teamId, input.teamId),
        eq(eventProjectionBootstrapFailures.consumerId, input.consumerId),
        eq(eventProjectionBootstrapFailures.projectionKey, input.projectionKey)
      )
    );
}

export async function recordProjectionBootstrapFailure(input: {
  teamId: string;
  consumerId: string;
  projectionKey: string;
  itemId: string;
  error: string;
}): Promise<void> {
  await db
    .insert(eventProjectionBootstrapFailures)
    .values(input)
    .onConflictDoUpdate({
      target: [
        eventProjectionBootstrapFailures.teamId,
        eventProjectionBootstrapFailures.consumerId,
        eventProjectionBootstrapFailures.projectionKey,
        eventProjectionBootstrapFailures.itemId,
      ],
      set: { error: input.error, createdAt: new Date() },
    });
}

/** The recorded projection keys per team, for several teams in one query. */
export async function listRecordedProjectionKeys(
  teamIds: string[],
  consumerId: string
): Promise<Map<string, Set<string>>> {
  const recorded = new Map<string, Set<string>>();
  if (teamIds.length === 0) {
    return recorded;
  }
  const rows = await db
    .select({
      teamId: eventProjectionBootstraps.teamId,
      projectionKey: eventProjectionBootstraps.projectionKey,
    })
    .from(eventProjectionBootstraps)
    .where(
      and(
        inArray(eventProjectionBootstraps.teamId, teamIds),
        eq(eventProjectionBootstraps.consumerId, consumerId)
      )
    );
  for (const row of rows) {
    const keys = recorded.get(row.teamId) ?? new Set<string>();
    keys.add(row.projectionKey);
    recorded.set(row.teamId, keys);
  }
  return recorded;
}

/**
 * The teams among `teamIds` whose every registered projection bootstrap is
 * recorded for the consumer. The tracker only follows the log of these teams,
 * so a consumer can use this to hold back a UI until its projections are full.
 */
export async function listBootstrappedTeamIds(
  teamIds: string[],
  consumerId: string
): Promise<string[]> {
  const keys = listHandlerProjectionBootstraps().map((bootstrap) => bootstrap.key);
  if (keys.length === 0) {
    return teamIds;
  }
  const recorded = await listRecordedProjectionKeys(teamIds, consumerId);
  return teamIds.filter((teamId) =>
    keys.every((key) => recorded.get(teamId)?.has(key))
  );
}

export async function recordProjectionBootstrap(input: {
  teamId: string;
  consumerId: string;
  projectionKey: string;
  asOfSeq: number;
}): Promise<void> {
  await db
    .insert(eventProjectionBootstraps)
    .values(input)
    .onConflictDoUpdate({
      target: [
        eventProjectionBootstraps.teamId,
        eventProjectionBootstraps.consumerId,
        eventProjectionBootstraps.projectionKey,
      ],
      set: { asOfSeq: input.asOfSeq },
    });
}