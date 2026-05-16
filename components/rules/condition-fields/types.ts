import type {
  EventFieldOperator,
  EventFieldValueType,
} from "../../../lib/rules/types";

export type ConditionPickerOption = {
  value: string;
  label: string;
};

export type ConditionPickerOptions = Record<string, ConditionPickerOption[] | undefined>;

export type ConditionFieldDefinition = {
  path: string;
  label: string;
  valueType: EventFieldValueType;
  operators: EventFieldOperator[];
  enumValues?: string[];
  picker?: string;
};

export type ConditionValueInputProps = {
  field: ConditionFieldDefinition;
  operator: EventFieldOperator;
  value: unknown;
  selectId?: string;
  openSelectId?: string | null;
  conditionOptions?: ConditionPickerOptions;
  onChange: (value: unknown) => void;
  onOpenSelectChange?: (selectId: string, open: boolean) => void;
};
