import { Button } from "@core/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "@core/hooks/use-translation";
import type { EventFieldOperator } from "../../lib/rules/types";
import type { ConditionPickerOptions } from "./condition-fields/types";
import { ConditionValueRenderer } from "./condition-fields/value-input";
import { normalizeConditionValueForOperator } from "./rule-helpers";
import type { EventTypeDto, RuleEditorDraft } from "./types";

type RuleConditionEditorProps = {
  draft: RuleEditorDraft;
  selectedEventType: EventTypeDto | undefined;
  openSelectId: string | null;
  conditionOptions?: ConditionPickerOptions;
  onAddConditionRow: () => void;
  onOpenSelectChange: (selectId: string, open: boolean) => void;
  setDraft: Dispatch<SetStateAction<RuleEditorDraft>>;
};

export function RuleConditionEditor({
  draft,
  selectedEventType,
  openSelectId,
  conditionOptions,
  onAddConditionRow,
  onOpenSelectChange,
  setDraft,
}: RuleConditionEditorProps) {
  const { t } = useTranslation();

  const getOperatorLabel = (operator: EventFieldOperator) => {
    switch (operator) {
      case "eq":
        return t`Equals`;
      case "neq":
        return t`Doesn't equal`;
      case "in":
        return t`Is one of`;
      case "notIn":
        return t`Is not one of`;
      case "contains":
        return t`Contains`;
      case "exists":
        return t`Exists`;
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{t`Conditions`}</h3>
          <p className="text-sm text-muted-foreground">
            {t`Narrow this rule to only the events you care about.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onAddConditionRow}>
          <Plus className="size-4" />
          {t`Add condition`}
        </Button>
      </div>

      {draft.conditionRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t`No conditions yet. This rule will run for every event of the selected type.`}
        </p>
      ) : (
        <div className="space-y-3">
          {draft.conditionRows.map((row) => {
            const field = selectedEventType?.conditionFields.find(
              (entry) => entry.path === row.path
            );
            if (!field) {
              return null;
            }

            return (
              <div
                key={row.id}
                className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.2fr_0.8fr_1.2fr_auto]"
              >
                <Select
                  value={row.path}
                  open={openSelectId === `condition-field-${row.id}`}
                  onOpenChange={(open) => onOpenSelectChange(`condition-field-${row.id}`, open)}
                  onValueChange={(path) => {
                    const nextField = selectedEventType?.conditionFields.find(
                      (entry) => entry.path === path
                    );
                    if (!nextField) {
                      return;
                    }

                    setDraft((current) => ({
                      ...current,
                      conditionRows: current.conditionRows.map((entry) =>
                        entry.id === row.id
                          ? {
                              ...entry,
                              path,
                              operator: nextField.operators[0] ?? "eq",
                              value: nextField.valueType === "boolean"
                                ? false
                                : nextField.operators[0] === "in" || nextField.operators[0] === "notIn"
                                  ? []
                                  : "",
                            }
                          : entry
                      ),
                    }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedEventType?.conditionFields.map((entry) => (
                      <SelectItem key={entry.path} value={entry.path}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={row.operator}
                  open={openSelectId === `condition-operator-${row.id}`}
                  onOpenChange={(open) => onOpenSelectChange(`condition-operator-${row.id}`, open)}
                  onValueChange={(operator) =>
                    setDraft((current) => ({
                      ...current,
                      conditionRows: current.conditionRows.map((entry) =>
                        entry.id === row.id
                          ? {
                              ...entry,
                              operator: operator as EventFieldOperator,
                              value: normalizeConditionValueForOperator(
                                entry.value,
                                operator as EventFieldOperator
                              ),
                            }
                          : entry
                      ),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.operators.map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {getOperatorLabel(operator)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ConditionValueRenderer
                  field={field}
                  operator={row.operator}
                  value={row.value}
                  selectId={`condition-value-${row.id}`}
                  openSelectId={openSelectId}
                  conditionOptions={conditionOptions}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      conditionRows: current.conditionRows.map((entry) =>
                        entry.id === row.id ? { ...entry, value } : entry
                      ),
                    }))
                  }
                  onOpenSelectChange={onOpenSelectChange}
                />

                <Button
                  variant="ghost-destructive"
                  size="icon"
                  aria-label={t`Remove condition`}
                  title={t`Remove condition`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      conditionRows: current.conditionRows.filter(
                        (entry) => entry.id !== row.id
                      ),
                    }))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
