import { idempotencyKeys } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq, getTableColumns, lte, sql } from "drizzle-orm";

/** How long a key holds its result: at least a day after the request finished. */
export const IDEMPOTENCY_KEY_RETENTION_MS = 24 * 60 * 60 * 1_000;

/**
 * How long a request may run before a key still reserved for it counts as one whose
 * request ended without its response being stored, such as when the server stopped
 * mid-request.
 */
export const IDEMPOTENCY_KEY_STALE_AFTER_MS = 10 * 60 * 1_000;

/**
 * Whether a key is still reserved for a request that started longer ago than a request
 * can run, for a query to select next to the key. It compares with the database's
 * clock, which also set `createdAt`, so a clock difference between the app and the
 * database can't move the threshold.
 */
export const idempotencyKeyIsStale = sql<boolean>`${idempotencyKeys.status} = 'in_progress' and ${idempotencyKeys.createdAt} <= now() - ${sql.raw(`interval '${IDEMPOTENCY_KEY_STALE_AFTER_MS} milliseconds'`)}`;

export type IdempotencyKeyRecord = typeof idempotencyKeys.$inferSelect;

/**
 * Where a key's request is: `in_progress` while it runs, `completed` once its
 * response, success or failure, is stored to be replayed, and `outcome_unknown` when
 * it ended without its response being stored.
 */
export type IdempotencyKeyStatus = IdempotencyKeyRecord["status"];

type KeyIdentity = { key: string; scope: string; teamId: string };

export type IdempotencyKeyReservation =
  | { id: string; outcome: "reserved" }
  | { outcome: "conflict" }
  | { outcome: "in_progress" }
  | { outcome: "outcome_unknown" }
  | { outcome: "completed"; record: IdempotencyKeyRecord };

const retentionEnd = () => new Date(Date.now() + IDEMPOTENCY_KEY_RETENTION_MS);

const identifiedBy = ({ key, scope, teamId }: KeyIdentity) =>
  and(eq(idempotencyKeys.teamId, teamId), eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));

/**
 * Reserves a key for a request, or says why the request can't go ahead under it:
 * the key was used for a different request, a request under it is still running,
 * one ended without a stored response, or it already completed and its response can
 * be replayed. Two requests racing for the same key can't both reserve it.
 */
export const reserveIdempotencyKey = async (
  input: KeyIdentity & { fingerprint: string },
  attempt = 1
): Promise<IdempotencyKeyReservation> => {
  // An expired key holds nothing back any more, so a request under it starts over
  await db.delete(idempotencyKeys).where(and(identifiedBy(input), lte(idempotencyKeys.expiresAt, new Date())));

  const [reserved] = await db
    .insert(idempotencyKeys)
    .values({ ...input, expiresAt: retentionEnd() })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });
  if (reserved) {
    return { id: reserved.id, outcome: "reserved" };
  }

  const [existing] = await db
    .select({ ...getTableColumns(idempotencyKeys), stale: idempotencyKeyIsStale })
    .from(idempotencyKeys)
    .where(identifiedBy(input))
    .limit(1);
  // Released or expired between the insert and the lookup, so it's free again
  if (!existing) {
    return attempt < 3 ? reserveIdempotencyKey(input, attempt + 1) : { outcome: "in_progress" };
  }

  if (existing.fingerprint !== input.fingerprint) {
    return { outcome: "conflict" };
  }

  const { stale, ...record } = existing;
  if (record.status === "in_progress") {
    return stale ? { outcome: "outcome_unknown" } : { outcome: "in_progress" };
  }

  if (record.status === "outcome_unknown") {
    return { outcome: "outcome_unknown" };
  }

  return { outcome: "completed", record };
};

/**
 * Stores the response a reserved key's request ended with, whatever its status, so a
 * repeat replays it.
 */
export const completeIdempotencyKey = async (
  id: string,
  response: { body: string; contentType: string | null; status: number }
) => {
  const expiresAt = retentionEnd();
  await db
    .update(idempotencyKeys)
    .set({
      expiresAt,
      responseBody: response.body,
      responseContentType: response.contentType,
      responseStatus: response.status,
      status: "completed",
    })
    .where(eq(idempotencyKeys.id, id));

  return expiresAt;
};

/**
 * Keeps a reserved key whose request ended without its response being stored, so a
 * repeat is refused instead of running it again: the request may have taken effect.
 */
export const holdIdempotencyKey = async (id: string) => {
  await db
    .update(idempotencyKeys)
    .set({ expiresAt: retentionEnd(), status: "outcome_unknown" })
    .where(eq(idempotencyKeys.id, id));
};

/** Frees a reserved key whose request was refused before anything happened, so it can be retried. */
export const releaseIdempotencyKey = async (id: string) => {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
};

export const purgeExpiredIdempotencyKeys = async () => {
  await db.delete(idempotencyKeys).where(lte(idempotencyKeys.expiresAt, new Date()));
};
