import { Checkbox } from "@core/components/ui/checkbox";
import { Label } from "@core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import { useId } from "react";
import type { ConditionValueInputProps } from "./types";

export function EnumValueInput({
  field,
  operator,
  value,
  selectId,
  openSelectId,
  onChange,
  onOpenSelectChange,
}: ConditionValueInputProps) {
  const inputIdPrefix = useId();
  const enumValues = field.enumValues ?? [];
  const selectedValues = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (operator === "in" || operator === "notIn") {
    return (
      <div className="grid gap-2 rounded-md border p-3">
        {enumValues.map((option) => {
          const checked = selectedValues.includes(option);
          const checkboxId = `${inputIdPrefix}-${option}`;
          return (
            <div key={option} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={checkboxId}
                checked={checked}
                onCheckedChange={(nextChecked) => {
                  const nextValues = nextChecked
                    ? [...selectedValues, option]
                    : selectedValues.filter((entry) => entry !== option);
                  onChange(nextValues);
                }}
              />
              <Label htmlFor={checkboxId}>{option}</Label>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Select
      value={typeof value === "string" ? value : undefined}
      onValueChange={onChange}
      open={openSelectId === selectId}
      onOpenChange={(open) => onOpenSelectChange?.(selectId ?? field.path, open)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select value" />
      </SelectTrigger>
      <SelectContent>
        {enumValues.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
