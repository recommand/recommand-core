import { type EventEnvelope, type VersionedCondition, versionedConditionSchema } from './types';

export function getValueAtPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// A date (2026-10-29) or a date and time (2026-10-29T10:00:00Z).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function toComparable(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }
  // Only ISO dates compare as dates: free text such as "Order 2024" never does.
  if (!ISO_DATE.test(value)) {
    return null;
  }
  const asDate = Date.parse(value);
  return Number.isNaN(asDate) ? null : asDate;
}

// Numbers and numeric strings compare as numbers, ISO dates as points in time.
// A value that is neither never matches an ordering operator.
export function compareOrdered(
  value: unknown,
  bound: unknown,
  test: (difference: number) => boolean,
) {
  const left = toComparable(value);
  const right = toComparable(bound);
  if (left === null || right === null) {
    return false;
  }
  return test(left - right);
}

/** Whether `source` matches the condition. Paths are read with dots, like `payload.companyId`. */
export function matchesValues(condition: VersionedCondition | null, source: unknown) {
  if (!condition) {
    return true;
  }

  const parsedCondition = versionedConditionSchema.parse(condition);
  return Object.entries(parsedCondition.match).every(([path, operators]) => {
    const value = getValueAtPath(source, path);

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
    if (operators.gt !== undefined && !compareOrdered(value, operators.gt, (d) => d > 0)) {
      return false;
    }
    if (operators.gte !== undefined && !compareOrdered(value, operators.gte, (d) => d >= 0)) {
      return false;
    }
    if (operators.lt !== undefined && !compareOrdered(value, operators.lt, (d) => d < 0)) {
      return false;
    }
    if (operators.lte !== undefined && !compareOrdered(value, operators.lte, (d) => d <= 0)) {
      return false;
    }

    return true;
  });
}

export function matchesCondition(condition: VersionedCondition | null, event: EventEnvelope) {
  return matchesValues(condition, event);
}
