import { Input } from "@core/components/ui/input";
import { Textarea } from "@core/components/ui/textarea";
import type { ConditionValueInputProps } from "./types";
import { useTranslation } from "@core/hooks/use-translation";

function listValueToString(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function StringArrayValueInput({
  operator,
  value,
  onChange,
}: ConditionValueInputProps) {
  const { t } = useTranslation();

  if (operator === "contains") {
    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t`Array member`}
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
      placeholder={t`Comma-separated values`}
    />
  );
}
