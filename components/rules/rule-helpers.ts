import type {
  EventFieldOperator,
  VersionedAction,
  VersionedCondition,
} from "../../lib/rules/types";
import { wildcardEventType } from "./rule-constants";
import type {
  RuleConditionRow,
  RuleDeliveryDto,
  RuleDto,
  EventTypeDto,
} from "./types";
import type { TranslationFunction } from "@core/lib/translations";

export function formatTimestamp(
  value: string | null,
  t: TranslationFunction,
  language: string
) {
  if (!value) {
    return t`Never`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(language);
}

export function toActionSummary(actions: VersionedAction[], t: TranslationFunction) {
  if (actions.length === 0) {
    return t`No actions`;
  }

  const labels = Array.from(
    new Set(
      actions.map((action) =>
        action.type === "webhook" ? t`Webhook` : t`Email`
      )
    )
  );

  return labels.length <= 2 ? labels.join(" + ") : t`${labels.length} actions`;
}

export function toTriggerLabel(
  rule: RuleDto,
  eventTypes: EventTypeDto[],
  t: TranslationFunction
) {
  if (rule.eventType === wildcardEventType) {
    return t`All supported webhook events`;
  }

  const eventType = eventTypes.find((entry) => entry.type === rule.eventType);
  return eventType?.ui?.label ?? rule.eventType;
}

export function badgeVariantForDeliveryStatus(status: RuleDeliveryDto["status"]) {
  if (status === "succeeded") {
    return "success";
  }
  if (status === "failed" || status === "giving_up") {
    return "destructive";
  }
  return "secondary";
}

export function summarizeHealth(delivery: RuleDeliveryDto | undefined, t: TranslationFunction) {
  if (!delivery) {
    return { label: t`No deliveries yet`, variant: "outline" as const };
  }

  if (delivery.status === "succeeded") {
    return { label: t`Last delivery succeeded`, variant: "success" as const };
  }

  if (delivery.status === "failed") {
    return { label: t`Retry scheduled`, variant: "secondary" as const };
  }

  if (delivery.status === "giving_up") {
    return { label: t`Delivery failed`, variant: "destructive" as const };
  }

  return { label: t`Delivery in progress`, variant: "secondary" as const };
}

export function flattenCondition(condition: VersionedCondition | null) {
  if (!condition) {
    return [] as RuleConditionRow[];
  }

  const rows: RuleConditionRow[] = [];
  for (const [path, operators] of Object.entries(condition.match)) {
    for (const [operator, value] of Object.entries(operators)) {
      if (value === undefined) {
        continue;
      }

      rows.push({
        id: crypto.randomUUID(),
        path,
        operator: operator as EventFieldOperator,
        value,
      });
    }
  }

  return rows;
}

export function buildCondition(rows: RuleConditionRow[]) {
  const match: Record<string, Record<string, unknown>> = {};

  for (const row of rows) {
    if (!row.path || !row.operator) {
      continue;
    }

    const requiresArray = row.operator === "in" || row.operator === "notIn";
    const requiresValue = row.operator !== "exists";
    const isEmptyArray = Array.isArray(row.value) && row.value.length === 0;
    const isEmptyValue =
      row.value === null ||
      row.value === undefined ||
      row.value === "" ||
      isEmptyArray;

    if (requiresValue && isEmptyValue) {
      continue;
    }

    if (!match[row.path]) {
      match[row.path] = {};
    }

    match[row.path][row.operator] = requiresArray && !Array.isArray(row.value)
      ? [row.value]
      : row.value;
  }

  return Object.keys(match).length === 0
    ? null
    : ({
        version: 1,
        match,
      } satisfies VersionedCondition);
}

export function normalizeConditionValueForOperator(
  value: unknown,
  operator: EventFieldOperator
) {
  if (operator === "exists") {
    return true;
  }

  if (operator === "in" || operator === "notIn") {
    if (Array.isArray(value)) {
      return value;
    }

    if (value === null || value === undefined || value === "") {
      return [];
    }

    return [value];
  }

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value;
}

export function parseRecipients(raw: string) {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildRecipientInputs(actions: VersionedAction[]) {
  return Object.fromEntries(
    actions.map((action, index) => [
      index,
      action.type === "email" ? action.config.to.join(", ") : "",
    ])
  ) as Record<number, string>;
}
