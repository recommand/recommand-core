import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import type { ConditionValueInputProps } from "./types";

function encodeBoolean(value: boolean) {
  return value ? "true" : "false";
}

export function BooleanValueInput({
  operator,
  value,
  selectId,
  openSelectId,
  onChange,
  onOpenSelectChange,
}: ConditionValueInputProps) {
  if (operator === "in" || operator === "notIn") {
    const currentValues = Array.isArray(value)
      ? value.filter((entry): entry is boolean => typeof entry === "boolean")
      : [];
    return (
      <Select
        value={currentValues.map(encodeBoolean).join(",") || "true"}
        onValueChange={(nextValue) =>
          onChange(
            nextValue.split(",").map((entry) => entry === "true")
          )
        }
        open={openSelectId === selectId}
        onOpenChange={(open) => onOpenSelectChange?.(selectId ?? "boolean-array", open)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select values" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">True</SelectItem>
          <SelectItem value="false">False</SelectItem>
          <SelectItem value="true,false">True or false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select
      value={typeof value === "boolean" ? encodeBoolean(value) : "true"}
      onValueChange={(nextValue) => onChange(nextValue === "true")}
      open={openSelectId === selectId}
      onOpenChange={(open) => onOpenSelectChange?.(selectId ?? "boolean", open)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select value" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="true">True</SelectItem>
        <SelectItem value="false">False</SelectItem>
      </SelectContent>
    </Select>
  );
}
