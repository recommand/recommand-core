import { Input } from "@core/components/ui/input";
import { Textarea } from "@core/components/ui/textarea";
import type { ConditionValueInputProps } from "./types";

function listValueToString(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function StringArrayValueInput({
  operator,
  value,
  onChange,
}: ConditionValueInputProps) {
  if (operator === "contains") {
    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Array member"
      />
    );
  }

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
      placeholder="Comma-separated values"
    />
  );
}
