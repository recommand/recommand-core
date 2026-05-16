import { Input } from "@core/components/ui/input";
import { Textarea } from "@core/components/ui/textarea";
import type { ConditionValueInputProps } from "./types";

function normalizeListValue(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function NumberValueInput({
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
              .map((entry) => Number(entry.trim()))
              .filter((entry) => !Number.isNaN(entry))
          )
        }
        placeholder="Comma-separated numbers"
      />
    );
  }

  return (
    <Input
      type="number"
      value={typeof value === "number" ? String(value) : ""}
      onChange={(event) =>
        onChange(event.target.value === "" ? null : Number(event.target.value))
      }
      placeholder="Number"
    />
  );
}
