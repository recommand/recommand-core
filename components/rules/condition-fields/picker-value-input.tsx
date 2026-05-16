import { Checkbox } from "@core/components/ui/checkbox";
import { Combobox } from "@core/components/ui/combobox";
import { Label } from "@core/components/ui/label";
import { useId } from "react";
import type { ConditionValueInputProps } from "./types";

export function PickerValueInput({
  field,
  operator,
  value,
  conditionOptions,
  onChange,
}: ConditionValueInputProps) {
  const inputIdPrefix = useId();
  const baseOptions = field.picker ? (conditionOptions?.[field.picker] ?? []) : [];
  const scalarValue = typeof value === "string" ? value : null;
  const selectedValues = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
  const options = [
    ...baseOptions,
    ...[...(scalarValue ? [scalarValue] : []), ...selectedValues]
      .filter((entry) => !baseOptions.some((option) => option.value === entry))
      .map((entry) => ({
        value: entry,
        label: entry,
      })),
  ];

  if (operator === "in" || operator === "notIn") {
    return (
      <div className="grid gap-2 rounded-md border p-3">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No options available.</p>
        ) : (
          options.map((option) => {
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
          })
        )}
      </div>
    );
  }

  return (
    <Combobox
      value={typeof value === "string" ? value : undefined}
      onValueChange={onChange}
      options={options}
      placeholder={`Select ${field.label.toLowerCase()}`}
      searchPlaceholder={`Search ${field.label.toLowerCase()}...`}
      emptyText="No options found."
    />
  );
}
