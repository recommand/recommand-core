import { DatePicker } from "@core/components/ui/date-picker";
import { Input } from "@core/components/ui/input";
import { Textarea } from "@core/components/ui/textarea";
import type { ConditionValueInputProps } from "./types";

function dateFromValue(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function listValueToString(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function DateValueInput({
  operator,
  value,
  onChange,
}: ConditionValueInputProps) {
  if (operator === "in" || operator === "notIn") {
    return (
      <Textarea
        value={listValueToString(value)}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          )
        }
        placeholder="Comma-separated ISO dates"
      />
    );
  }

  if (operator === "contains") {
    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="ISO date"
      />
    );
  }

  return (
    <DatePicker
      date={dateFromValue(value)}
      onDateChange={(date) =>
        onChange(date ? date.toISOString() : null)
      }
      placeholder="Pick a date"
    />
  );
}
