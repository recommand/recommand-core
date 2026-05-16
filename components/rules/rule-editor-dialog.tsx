import { Button } from "@core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@core/components/ui/dialog";
import { Input } from "@core/components/ui/input";
import { Label } from "@core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@core/components/ui/select";
import { Switch } from "@core/components/ui/switch";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { ConditionPickerOptions } from "./condition-fields/types";
import { RuleActionEditor } from "./rule-action-editor";
import { RuleConditionEditor } from "./rule-condition-editor";
import { wildcardEventType } from "./rule-constants";
import type {
  EventTypeDto,
  RuleDto,
  RuleEditorDraft,
} from "./types";

type RuleEditorDialogProps = {
  open: boolean;
  editingRule: RuleDto | null;
  draft: RuleEditorDraft;
  eventTypes: EventTypeDto[];
  selectedEventType: EventTypeDto | undefined;
  wildcardAvailable: boolean;
  conditionOptions?: ConditionPickerOptions;
  recipientInputs: Record<number, string>;
  onOpenChange: (open: boolean) => void;
  onEventTypeChange: (eventType: string) => void;
  onAddConditionRow: () => void;
  onSaveRule: () => Promise<void>;
  setDraft: Dispatch<SetStateAction<RuleEditorDraft>>;
  setRecipientInputs: Dispatch<SetStateAction<Record<number, string>>>;
};

export function RuleEditorDialog({
  open,
  editingRule,
  draft,
  eventTypes,
  selectedEventType,
  wildcardAvailable,
  conditionOptions,
  recipientInputs,
  onOpenChange,
  onEventTypeChange,
  onAddConditionRow,
  onSaveRule,
  setDraft,
  setRecipientInputs,
}: RuleEditorDialogProps) {
  const [openSelectId, setOpenSelectId] = useState<string | null>(null);

  function handleOpenSelectChange(selectId: string, open: boolean) {
    setOpenSelectId(open ? selectId : null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setOpenSelectId(null);
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{editingRule ? "Edit rule" : "Create rule"}</DialogTitle>
          <DialogDescription>
            Choose when this rule should run and what it should do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Rule name"
              />
            </div>

            <label className="flex items-center gap-3 py-2">
              <Switch
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, enabled: checked }))
                }
              />
              <span className="font-medium">Enabled</span>
            </label>
          </div>

          <div className="space-y-2">
            <Label>Event type</Label>
            <Select
              value={draft.eventType}
              open={openSelectId === "event-type"}
              onOpenChange={(nextOpen) => handleOpenSelectChange("event-type", nextOpen)}
              onValueChange={onEventTypeChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select event type" />
              </SelectTrigger>
              <SelectContent>
                {wildcardAvailable && (
                  <SelectItem value={wildcardEventType}>
                    All supported webhook events
                  </SelectItem>
                )}
                {eventTypes.map((eventType) => (
                  <SelectItem key={eventType.type} value={eventType.type}>
                    {eventType.ui?.group ? `${eventType.ui.group} · ` : ""}
                    {eventType.ui?.label ?? eventType.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEventType?.ui?.description && draft.eventType !== wildcardEventType && (
              <p className="text-sm text-muted-foreground">
                {selectedEventType.ui.description}
              </p>
            )}
          </div>

          {draft.eventType !== wildcardEventType && (
            <RuleConditionEditor
              draft={draft}
              selectedEventType={selectedEventType}
              openSelectId={openSelectId}
              conditionOptions={conditionOptions}
              onAddConditionRow={onAddConditionRow}
              onOpenSelectChange={handleOpenSelectChange}
              setDraft={setDraft}
            />
          )}

          <RuleActionEditor
            draft={draft}
            selectedEventType={selectedEventType}
            recipientInputs={recipientInputs}
            setDraft={setDraft}
            setRecipientInputs={setRecipientInputs}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSaveRule}>Save rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
