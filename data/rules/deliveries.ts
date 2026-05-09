import crypto from "node:crypto";
import { getEmailTemplate } from "@core/emails";
import { sendEmail } from "@core/lib/email";
import { eq } from "drizzle-orm";
import { db } from "@recommand/db";
import { ruleActionDeliveries } from "../../db/schema";
import { getEventTypeDefinition } from "./events";
import { getReadyDeliveries, getRulesByIds, parseRuleAction } from "./rules";
import { eventEnvelopeSchema, type EventEnvelope } from "../../lib/rules/types";

const retryScheduleMs = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 8 * 60 * 60_000];

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shouldRetryHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function buildWebhookHeaders(body: string, secret?: string, deliveryId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (deliveryId) {
    headers["X-Idempotency-Key"] = deliveryId;
  }

  if (secret) {
    headers["X-Signature"] = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  }

  return headers;
}

function toSerializableValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toSerializableValue(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    if ("toISOString" in value && typeof value.toISOString === "function") {
      try {
        const isoString = value.toISOString();
        if (typeof isoString === "string") {
          seen.delete(value);
          return isoString;
        }
      } catch {
      }
    }

    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => [key, toSerializableValue(entryValue, seen)]
    );

    seen.delete(value);
    return Object.fromEntries(entries);
  }

  return String(value);
}

async function handleWebhookV1(
  deliveryId: string,
  action: ReturnType<typeof parseRuleAction>,
  event: EventEnvelope
) {
  if (action.type !== "webhook" || action.version !== 1) {
    throw new Error("Unsupported webhook action");
  }

  const definition = getEventTypeDefinition(event.type);
  if (!definition?.webhook) {
    throw new Error(`Event type ${event.type} does not support webhook delivery`);
  }

  const body = JSON.stringify(
    toSerializableValue(definition.webhook.project(event))
  );
  const response = await fetch(action.config.url, {
    method: "POST",
    headers: buildWebhookHeaders(body, action.config.secret, deliveryId),
    body,
    signal: AbortSignal.timeout(30_000),
  });

  return {
    ok: response.ok,
    status: response.status,
    error: response.ok ? null : `Webhook responded with status ${response.status}`,
  };
}

async function handleEmailV1(
  action: ReturnType<typeof parseRuleAction>,
  event: EventEnvelope
) {
  if (action.type !== "email" || action.version !== 1) {
    throw new Error("Unsupported email action");
  }

  const definition = getEventTypeDefinition(event.type);
  if (!definition?.email) {
    throw new Error(`Event type ${event.type} does not support email delivery`);
  }

  const template = await getEmailTemplate(definition.email.template);
  const props = {
    event,
    teamId: event.teamId,
    type: event.type,
  };
  const enrichedProps = definition.email.buildProps
    ? {
        ...props,
        ...(await definition.email.buildProps(event)),
      }
    : props;
  const attachments = definition.email.buildAttachments
    ? await definition.email.buildAttachments(event, action.config.attach)
    : [];

  await sendEmail({
    to: action.config.to.join(","),
    subject: template.subject(enrichedProps),
    email: template.render(enrichedProps),
    attachments,
  });

  return {
    ok: true,
    status: 200,
    error: null,
  };
}

export async function processRuleDeliveries(limit = 50) {
  const deliveries = await getReadyDeliveries(limit);
  if (deliveries.length === 0) {
    return 0;
  }

  const rulesById = await getRulesByIds(deliveries.map((delivery) => delivery.ruleId));

  for (const delivery of deliveries) {
    const rule = rulesById.get(delivery.ruleId);
    const event = eventEnvelopeSchema.parse(delivery.payload);

    if (!rule) {
      await db
        .update(ruleActionDeliveries)
        .set({
          status: "giving_up",
          lastError: "Rule was unavailable when this delivery was processed",
          processedAt: new Date(),
          lockedUntil: null,
        })
        .where(eq(ruleActionDeliveries.id, delivery.id));
      continue;
    }

    const action = parseRuleAction(rule.actions[delivery.actionIndex]);

    try {
      const result =
        action.type === "webhook"
          ? await handleWebhookV1(delivery.id, action, event)
          : await handleEmailV1(action, event);

      const nextAttemptCount = delivery.attempts + 1;
      const shouldRetry = !result.ok && shouldRetryHttpStatus(result.status);
      const nextStatus = result.ok
        ? "succeeded"
        : !shouldRetry || nextAttemptCount >= retryScheduleMs.length
          ? "giving_up"
          : "failed";
      const retryAt = result.ok || !shouldRetry
        ? undefined
        : new Date(Date.now() + retryScheduleMs[Math.min(delivery.attempts, retryScheduleMs.length - 1)]);

      await db
        .update(ruleActionDeliveries)
        .set({
          status: nextStatus,
          attempts: nextAttemptCount,
          retryAt,
          lockedUntil: null,
          lastError: result.error,
          lastResponseStatus: result.status,
          processedAt: result.ok || nextStatus === "giving_up" ? new Date() : null,
        })
        .where(eq(ruleActionDeliveries.id, delivery.id));
    } catch (error) {
      const nextAttemptCount = delivery.attempts + 1;
      const nextStatus = nextAttemptCount >= retryScheduleMs.length ? "giving_up" : "failed";

      await db
        .update(ruleActionDeliveries)
        .set({
          status: nextStatus,
          attempts: nextAttemptCount,
          retryAt: new Date(Date.now() + retryScheduleMs[Math.min(delivery.attempts, retryScheduleMs.length - 1)]),
          lockedUntil: null,
          lastError: stringifyError(error),
          processedAt: nextStatus === "giving_up" ? new Date() : null,
        })
        .where(eq(ruleActionDeliveries.id, delivery.id));
    }
  }

  return deliveries.length;
}
