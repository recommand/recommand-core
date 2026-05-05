import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import type { EventFieldOperator } from "../../../lib/rules/types";
import { BooleanValueInput } from "./boolean-value-input";
import { DateValueInput } from "./date-value-input";
import { EnumValueInput } from "./enum-value-input";
import { NumberValueInput } from "./number-value-input";
import { PickerValueInput } from "./picker-value-input";
import { StringArrayValueInput } from "./string-array-value-input";
import { StringValueInput } from "./string-value-input";
import type { ConditionValueInputProps } from "./types";

export function ConditionValueRenderer(props: ConditionValueInputProps) {
  if (props.operator === "exists") {
    return (
      <Select
        value={props.value === false ? "false" : "true"}
        onValueChange={(value) => props.onChange(value === "true")}
        open={props.openSelectId === props.selectId}
        onOpenChange={(open) => props.onOpenSelectChange?.(props.selectId ?? "exists", open)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Exists</SelectItem>
          <SelectItem value="false">Does not exist</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (props.field.picker && props.field.valueType === "string") {
    return <PickerValueInput {...props} />;
  }

  if (props.field.valueType === "number") {
    return <NumberValueInput {...props} />;
  }
  if (props.field.valueType === "boolean") {
    return <BooleanValueInput {...props} />;
  }
  if (props.field.valueType === "date") {
    return <DateValueInput {...props} />;
  }
  if (props.field.valueType === "string[]") {
    return <StringArrayValueInput {...props} />;
  }
  if (props.field.valueType === "enum") {
    return <EnumValueInput {...props} />;
  }

  return <StringValueInput {...props} />;
}
