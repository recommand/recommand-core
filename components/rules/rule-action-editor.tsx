import { Badge } from "@core/components/ui/badge";
import { Button } from "@core/components/ui/button";
import { Checkbox } from "@core/components/ui/checkbox";
import { Input } from "@core/components/ui/input";
import { Label } from "@core/components/ui/label";
import { Textarea } from "@core/components/ui/textarea";
import { Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  emptyEmailAction,
  emptyWebhookAction,
  wildcardEventType,
} from "./rule-constants";
import { buildRecipientInputs, parseRecipients } from "./rule-helpers";
import type { EventTypeDto, RuleEditorDraft } from "./types";

type RuleActionEditorProps = {
  draft: RuleEditorDraft;
  selectedEventType: EventTypeDto | undefined;
  recipientInputs: Record<number, string>;
  setDraft: Dispatch<SetStateAction<RuleEditorDraft>>;
  setRecipientInputs: Dispatch<SetStateAction<Record<number, string>>>;
};

export function RuleActionEditor({
  draft,
  selectedEventType,
  recipientInputs,
  setDraft,
  setRecipientInputs,
}: RuleActionEditorProps) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Actions</h3>
          <p className="text-sm text-muted-foreground">
            Choose what should happen when this rule matches.
          </p>
        </div>
        {draft.eventType !== wildcardEventType && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft((current) => {
                  const actions = [...current.actions, structuredClone(emptyWebhookAction)];
                  setRecipientInputs(buildRecipientInputs(actions));
                  return {
                    ...current,
                    actions,
                  };
                })
              }
            >
              Add webhook
            </Button>
            {selectedEventType?.email && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => {
                    const actions = [...current.actions, structuredClone(emptyEmailAction)];
                    setRecipientInputs(buildRecipientInputs(actions));
                    return {
                      ...current,
                      actions,
                    };
                  })
                }
              >
                Add email
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {draft.actions.map((action, index) => (
          <div key={`${action.type}-${index}`} className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline">
                {action.type === "webhook" ? "Webhook action" : "Email action"}
              </Badge>
              {(draft.actions.length > 1 || draft.eventType !== wildcardEventType) && (
                <Button
                  variant="ghost-destructive"
                  size="icon"
                  aria-label="Remove action"
                  title="Remove action"
                  onClick={() =>
                    setDraft((current) => {
                      const actions = current.actions.filter((_, actionIndex) => actionIndex !== index);
                      setRecipientInputs(buildRecipientInputs(actions));
                      return {
                        ...current,
                        actions,
                      };
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>

            {action.type === "webhook" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Target URL</Label>
                  <Input
                    value={action.config.url}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        actions: current.actions.map((entry, actionIndex) =>
                          actionIndex === index && entry.type === "webhook"
                            ? {
                                ...entry,
                                config: {
                                  ...entry.config,
                                  url: event.target.value,
                                },
                              }
                            : entry
                        ),
                      }))
                    }
                    placeholder="https://example.com/webhook"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Signing secret</Label>
                  <Input
                    value={action.config.secret ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        actions: current.actions.map((entry, actionIndex) =>
                          actionIndex === index && entry.type === "webhook"
                            ? {
                                ...entry,
                                config: {
                                  ...entry.config,
                                  secret: event.target.value || undefined,
                                },
                              }
                            : entry
                        ),
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Recipients</Label>
                  <Textarea
                    value={recipientInputs[index] ?? action.config.to.join(", ")}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      setRecipientInputs((current) => ({
                        ...current,
                        [index]: rawValue,
                      }));
                      setDraft((current) => ({
                        ...current,
                        actions: current.actions.map((entry, actionIndex) =>
                          actionIndex === index && entry.type === "email"
                            ? {
                                ...entry,
                                config: {
                                  ...entry.config,
                                  to: parseRecipients(rawValue),
                                },
                              }
                            : entry
                        ),
                      }));
                    }}
                    placeholder="Comma or newline separated email addresses"
                  />
                </div>
                {selectedEventType?.email?.attachments && selectedEventType.email.attachments.length > 0 && (
                  <div className="space-y-2">
                    <Label>Attachments</Label>
                    <div className="grid gap-3 md:grid-cols-2">
                      {selectedEventType.email.attachments.map((attachment) => (
                        <div key={attachment.key} className="space-y-1">
                          <label className="flex items-center space-x-2">
                            <Checkbox
                              checked={Boolean(action.config.attach?.[attachment.key])}
                              onCheckedChange={(checked) =>
                                setDraft((current) => ({
                                  ...current,
                                  actions: current.actions.map((entry, actionIndex) =>
                                    actionIndex === index && entry.type === "email"
                                      ? {
                                          ...entry,
                                          config: {
                                            ...entry.config,
                                            attach: {
                                              ...entry.config.attach,
                                              [attachment.key]: Boolean(checked),
                                            },
                                          },
                                        }
                                      : entry
                                  ),
                                }))
                              }
                            />
                            <span className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {attachment.label}
                            </span>
                          </label>
                          {attachment.description && (
                            <p className="pl-6 text-sm text-muted-foreground">{attachment.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
