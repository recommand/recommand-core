import type { AuditJson } from "../../lib/audit";
import type { Rule } from "../../lib/rules/types";

function toAuditJson(value: unknown): AuditJson | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toAuditJson(entry) ?? null);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toAuditJson(entry)])
    );
  }

  return undefined;
}

export function ruleAuditSnapshot(rule: Rule): AuditJson {
  try {
    return toAuditJson({
      name: rule.name,
      enabled: rule.enabled,
      eventType: rule.eventType,
      condition: rule.condition,
      actions: rule.actions.map((action) =>
        action.type === "webhook"
          ? {
              ...action,
              config: {
                ...action.config,
                secret: action.config.secret ? "present" : undefined,
              },
            }
          : action
      ),
    }) ?? {};
  } catch {
    return {
      name: rule.name,
      enabled: rule.enabled,
      eventType: rule.eventType,
    };
  }
}
