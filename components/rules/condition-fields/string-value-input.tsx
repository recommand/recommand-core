import { Input } from "@core/components/ui/input";
import { Textarea } from "@core/components/ui/textarea";
import type { ConditionValueInputProps } from "./types";

function normalizeListValue(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function StringValueInput({
  operator,
  value,
  onChange,
}: ConditionValueInputProps) {
  if (operator === "in" || operator === "notIn") {
    return (
      <Textarea
        value={normalizeListValue(value)}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          )
        }
        placeholder="Comma-separated values"
      />
    );
  }

  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Value"
    />
  );
}
