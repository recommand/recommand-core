import { createHash } from "node:crypto";
import type { Context } from "@recommand/lib/api";
import { auditEvents } from "@core/db/schema";
import { db } from "@recommand/db";

export type AuditOutcome = "allowed" | "denied" | "failed";

export type AuditJson =
  | string
  | number
  | boolean
  | null
  | AuditJson[]
  | { [key: string]: AuditJson | undefined };

export type AuditEventInput = {
  action: string;
  subsystem: string;
  outcome?: AuditOutcome;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  actorIp?: string | null;
  actorUserAgent?: string | null;
  teamId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  reasonCode?: string | null;
  requestId?: string | null;
  before?: AuditJson;
  after?: AuditJson;
  metadata?: AuditJson;
  occurredAt?: Date;
};

type ContextUser = {
  id?: string | null;
  isAdmin?: boolean | null;
};

type ContextTeam = {
  id?: string | null;
};

type ContextApiKey = {
  id?: string | null;
  teamId?: string | null;
};

function contextValue<T>(c: Context, key: string): T | undefined {
  try {
    return c.get(key) as T | undefined;
  } catch {
    return undefined;
  }
}

function firstHeaderValue(value: string | undefined): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export function hashAuditIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export async function writeAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      occurredAt: event.occurredAt ?? new Date(),
      action: event.action,
      subsystem: event.subsystem,
      outcome: event.outcome ?? "allowed",
      actorUserId: event.actorUserId ?? null,
      actorApiKeyId: event.actorApiKeyId ?? null,
      actorIp: event.actorIp ?? null,
      actorUserAgent: event.actorUserAgent ?? null,
      teamId: event.teamId ?? null,
      objectType: event.objectType ?? null,
      objectId: event.objectId ?? null,
      reasonCode: event.reasonCode ?? null,
      requestId: event.requestId ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      metadata: event.metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to write audit event", error);
  }
}

export async function audit(c: Context, event: AuditEventInput): Promise<void> {
  try {
    const user = contextValue<ContextUser>(c, "user");
    const team = contextValue<ContextTeam>(c, "team");
    const apiKey = contextValue<ContextApiKey>(c, "apiKey");
    const teamId = event.teamId ?? team?.id ?? apiKey?.teamId ?? contextValue<string>(c, "teamId") ?? null;
    const metadata =
      typeof event.metadata === "object" && event.metadata !== null && !Array.isArray(event.metadata)
        ? event.metadata
        : event.metadata === undefined
          ? {}
          : { value: event.metadata };

    await writeAuditEvent({
      ...event,
      actorUserId: event.actorUserId ?? user?.id ?? null,
      actorApiKeyId: event.actorApiKeyId ?? apiKey?.id ?? null,
      actorIp:
        event.actorIp ??
        firstHeaderValue(c.req.header("cf-connecting-ip")) ??
        firstHeaderValue(c.req.header("x-forwarded-for")) ??
        firstHeaderValue(c.req.header("x-real-ip")),
      actorUserAgent: event.actorUserAgent ?? c.req.header("user-agent") ?? null,
      teamId,
      requestId:
        event.requestId ??
        c.req.header("cf-ray") ??
        c.req.header("x-request-id") ??
        c.req.header("x-correlation-id") ??
        null,
      metadata: {
        method: c.req.method,
        path: c.req.path,
        ...metadata,
      },
    });
  } catch (error) {
    console.error("Failed to prepare audit event", error);
  }
}
