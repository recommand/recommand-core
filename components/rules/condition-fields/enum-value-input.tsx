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
import { useTranslation } from "@core/hooks/use-translation";
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
  const { t } = useTranslation();
  const inputIdPrefix = useId();
  const options = field.enumOptions ?? (field.enumValues ?? []).map((option) => ({
    value: option,
    label: option,
  }));
  const selectedValues = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (operator === "in" || operator === "notIn") {
    return (
      <div className="grid gap-2 rounded-md border p-3">
        {options.map((option) => {
          const checked = selectedValues.includes(option.value);
          const checkboxId = `${inputIdPrefix}-${option.value}`;
          return (
            <div key={option.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={checkboxId}
                checked={checked}
                onCheckedChange={(nextChecked) => {
                  const nextValues = nextChecked
                    ? [...selectedValues, option.value]
                    : selectedValues.filter((entry) => entry !== option.value);
                  onChange(nextValues);
                }}
              />
              <Label htmlFor={checkboxId}>{option.label}</Label>
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
        <SelectValue placeholder={t`Select value`} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
