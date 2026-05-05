import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@recommand/db";
import { ruleActionDeliveries, rules } from "../../db/schema";
import { getEventTypeDefinition, listEventTypeDefinitions } from "./events";
import {
  createRuleSchema,
  ruleSchema,
  updateRuleSchema,
  versionedConditionSchema,
  versionedActionSchema,
  type CreateRuleInput,
  type EventFieldOperator,
  type EventEnvelope,
  type Rule,
  type UpdateRuleInput,
  type VersionedAction,
  type VersionedCondition,
} from "../../lib/rules/types";
import type { Tx } from "./db";

function getValueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateConditionForRule(
  eventType: string,
  condition: VersionedCondition | null | undefined,
  concreteEventType: string = eventType
) {
  if (!condition) {
    return;
  }

  const parsedCondition = versionedConditionSchema.parse(condition);
  const hasConditions = Object.keys(parsedCondition.match).length > 0;

  if (eventType === "*" && concreteEventType === "*") {
    if (!hasConditions) {
      return;
    }

    const webhookDefinitions = listEventTypeDefinitions().filter(
      (definition) => definition.webhook
    );

    if (webhookDefinitions.length === 0) {
      throw new Error("Wildcard webhook conditions require at least one webhook event type");
    }

    for (const definition of webhookDefinitions) {
      validateConditionForRule(eventType, condition, definition.type);
    }
    return;
  }

  const definition = getEventTypeDefinition(concreteEventType);
  if (!definition) {
    throw new Error(`Unknown event type: ${concreteEventType}`);
  }

  const fieldsByPath = new Map(
    definition.conditionFields.map((field) => [field.path, field])
  );

  for (const [path, operators] of Object.entries(parsedCondition.match)) {
    const field = fieldsByPath.get(path);
    if (!field) {
      throw new Error(
        `Condition field "${path}" is not supported for event type ${concreteEventType}`
      );
    }

    for (const operator of Object.keys(operators) as Array<keyof typeof operators>) {
      if (operators[operator] === undefined) {
        continue;
      }

      if (!field.operators.includes(operator as EventFieldOperator)) {
        throw new Error(
          `Condition operator "${operator}" is not supported for field "${path}" on event type ${concreteEventType}`
        );
      }
    }
  }
}

export function matchesCondition(
  condition: VersionedCondition | null,
  event: EventEnvelope
) {
  if (!condition) {
    return true;
  }

  const parsedCondition = versionedConditionSchema.parse(condition);
  return Object.entries(parsedCondition.match).every(([path, operators]) => {
    const value = getValueAtPath(event, path);

    if (operators.eq !== undefined && !valuesEqual(value, operators.eq)) {
      return false;
    }
    if (operators.neq !== undefined && valuesEqual(value, operators.neq)) {
      return false;
    }
    if (operators.in !== undefined) {
      const match = operators.in.some((entry) => valuesEqual(value, entry));
      if (!match) {
        return false;
      }
    }
    if (operators.notIn !== undefined) {
      const match = operators.notIn.some((entry) => valuesEqual(value, entry));
      if (match) {
        return false;
      }
    }
    if (operators.contains !== undefined) {
      if (!Array.isArray(value)) {
        return false;
      }
      const match = value.some((entry) => valuesEqual(entry, operators.contains));
      if (!match) {
        return false;
      }
    }
    if (operators.exists !== undefined) {
      const exists = value !== undefined && value !== null;
      if (exists !== operators.exists) {
        return false;
      }
    }

    return true;
  });
}

function parseRuleRow(row: typeof rules.$inferSelect): Rule {
  return ruleSchema.parse({
    ...row,
    condition: row.condition ?? null,
    actions: row.actions,
    updatedAt: row.updatedAt ?? null,
  });
}

export async function listRules(
  teamId: string,
  filters?: {
    eventType?: string;
    actionType?: string;
    enabled?: boolean;
  }
) {
  const allRules = await db
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.teamId, teamId),
        filters?.eventType ? eq(rules.eventType, filters.eventType) : undefined,
        filters?.enabled === undefined ? undefined : eq(rules.enabled, filters.enabled)
      )
    )
    .orderBy(desc(rules.updatedAt), desc(rules.createdAt));

  return allRules
    .map(parseRuleRow)
    .filter((rule) =>
      filters?.actionType
        ? rule.actions.some((action) => action.type === filters.actionType)
        : true
    );
}

export async function getRule(teamId: string, ruleId: string) {
  const [rule] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.teamId, teamId), eq(rules.id, ruleId)))
    .limit(1);

  return rule ? parseRuleRow(rule) : null;
}

export async function createRule(teamId: string, input: CreateRuleInput) {
  const parsed = createRuleSchema.parse(input);
  const id = parsed.id ?? "rul_" + ulid();
  validateConditionForRule(parsed.eventType, parsed.condition ?? null);

  const [createdRule] = await db
    .insert(rules)
    .values({
      id,
      teamId,
      name: parsed.name,
      enabled: parsed.enabled ?? true,
      eventType: parsed.eventType,
      condition: parsed.condition ?? null,
      actions: parsed.actions,
      schemaVersion: 1,
    })
    .returning();

  return parseRuleRow(createdRule);
}

export async function updateRule(
  teamId: string,
  ruleId: string,
  input: UpdateRuleInput
) {
  const existingRule = await getRule(teamId, ruleId);
  if (!existingRule) {
    return null;
  }

  const parsed = updateRuleSchema.parse(input);
  const nextEventType = parsed.eventType ?? existingRule.eventType;
  const nextCondition =
    parsed.condition === undefined ? existingRule.condition : parsed.condition ?? null;
  validateConditionForRule(nextEventType, nextCondition);
  const shouldTouchSchemaVersion = Object.keys(parsed).length > 0;
  const [updatedRule] = await db
    .update(rules)
    .set({
      name: parsed.name,
      enabled: parsed.enabled,
      eventType: parsed.eventType,
      condition: parsed.condition === undefined ? undefined : parsed.condition ?? null,
      actions: parsed.actions,
      schemaVersion: shouldTouchSchemaVersion ? 1 : undefined,
    })
    .where(and(eq(rules.teamId, teamId), eq(rules.id, ruleId)))
    .returning();

  return updatedRule ? parseRuleRow(updatedRule) : null;
}

export async function deleteRule(teamId: string, ruleId: string) {
  await db.delete(rules).where(and(eq(rules.teamId, teamId), eq(rules.id, ruleId)));
}

export async function listRuleDeliveries(teamId: string, ruleId: string) {
  return await db
    .select()
    .from(ruleActionDeliveries)
    .where(
      and(
        eq(ruleActionDeliveries.teamId, teamId),
        eq(ruleActionDeliveries.ruleId, ruleId)
      )
    )
    .orderBy(desc(ruleActionDeliveries.createdAt));
}

export async function listRuleDeliveriesPage(
  teamId: string,
  ruleId: string,
  options?: {
    page?: number;
    limit?: number;
  }
) {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 25));
  const offset = (page - 1) * limit;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ruleActionDeliveries)
    .where(
      and(
        eq(ruleActionDeliveries.teamId, teamId),
        eq(ruleActionDeliveries.ruleId, ruleId)
      )
    );

  const deliveries = await db
    .select()
    .from(ruleActionDeliveries)
    .where(
      and(
        eq(ruleActionDeliveries.teamId, teamId),
        eq(ruleActionDeliveries.ruleId, ruleId)
      )
    )
    .orderBy(desc(ruleActionDeliveries.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    deliveries,
    page,
    limit,
    total: count,
    pageCount: Math.max(1, Math.ceil(count / limit)),
  };
}

export async function retryRuleDelivery(
  teamId: string,
  ruleId: string,
  deliveryId: string
) {
  const [delivery] = await db
    .update(ruleActionDeliveries)
    .set({
      status: "pending",
      retryAt: new Date(),
      lockedUntil: null,
      lastError: null,
      processedAt: null,
    })
    .where(
      and(
        eq(ruleActionDeliveries.id, deliveryId),
        eq(ruleActionDeliveries.ruleId, ruleId),
        eq(ruleActionDeliveries.teamId, teamId)
      )
    )
    .returning();

  return delivery ?? null;
}

export async function dispatchRulesForEvent(
  event: EventEnvelope,
  executor: Tx | typeof db
) {
  const matchingRules = await executor
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.teamId, event.teamId),
        eq(rules.enabled, true),
        or(eq(rules.eventType, event.type), eq(rules.eventType, "*"))
      )
    )
    .orderBy(asc(rules.createdAt));

  for (const row of matchingRules) {
    let parsedRule: Rule;
    try {
      parsedRule = parseRuleRow(row);
    } catch (error) {
      console.error("Skipping invalid rule", row.id, error);
      continue;
    }

    if (parsedRule.schemaVersion !== 1) {
      console.error("Skipping unknown rule schema version", parsedRule.id);
      continue;
    }

    if (parsedRule.eventType === "*" && !getEventTypeDefinition(event.type)?.webhook) {
      continue;
    }

    try {
      validateConditionForRule(parsedRule.eventType, parsedRule.condition, event.type);
    } catch (error) {
      console.error("Skipping invalid rule condition", parsedRule.id, error);
      continue;
    }

    if (!matchesCondition(parsedRule.condition, event)) {
      continue;
    }

    const deliveries = parsedRule.actions.map((action, actionIndex) => ({
      id: "rad_" + ulid(),
      ruleId: parsedRule.id,
      actionIndex,
      actionType: action.type,
      actionVersion: action.version,
      eventId: event.id,
      eventType: event.type,
      teamId: event.teamId,
      idempotencyKey: event.idempotencyKey,
      payload: event,
    }));

    if (deliveries.length === 0) {
      continue;
    }

    await executor
      .insert(ruleActionDeliveries)
      .values(deliveries)
      .onConflictDoNothing({
        target: [
          ruleActionDeliveries.eventId,
          ruleActionDeliveries.ruleId,
          ruleActionDeliveries.actionIndex,
        ],
      });
  }
}

export async function getReadyDeliveries(limit = 50) {
  const now = new Date();
  const result = await db.execute(sql`
    with next_deliveries as (
      select id
      from rule_action_deliveries
      where status in ('pending', 'failed')
        and retry_at <= ${now}
        and (locked_until is null or locked_until < ${now})
      order by retry_at asc
      limit ${limit}
      for update skip locked
    )
    update rule_action_deliveries
    set status = 'in_flight',
        locked_until = ${new Date(now.getTime() + 5 * 60 * 1000)},
        updated_at = now()
    where id in (select id from next_deliveries)
    returning
      id,
      rule_id as "ruleId",
      action_index as "actionIndex",
      action_type as "actionType",
      action_version as "actionVersion",
      event_id as "eventId",
      event_type as "eventType",
      team_id as "teamId",
      idempotency_key as "idempotencyKey",
      payload,
      status,
      attempts,
      retry_at as "retryAt",
      locked_until as "lockedUntil",
      last_error as "lastError",
      last_response_status as "lastResponseStatus",
      processed_at as "processedAt",
      created_at as "createdAt",
      updated_at as "updatedAt";
  `);

  return result.rows as Array<typeof ruleActionDeliveries.$inferSelect>;
}

export async function getRulesByIds(ruleIds: string[]) {
  if (ruleIds.length === 0) {
    return new Map<string, Rule>();
  }

  const rows = await db
    .select()
    .from(rules)
    .where(inArray(rules.id, ruleIds));

  return new Map(rows.map((row) => [row.id, parseRuleRow(row)]));
}

export function parseRuleAction(action: unknown): VersionedAction {
  return versionedActionSchema.parse(action);
}
