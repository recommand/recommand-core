import { db } from "@recommand/db";
import { eventProjectionBootstraps } from "@core/db/schema";
import { and, eq } from "drizzle-orm";

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