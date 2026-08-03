import { AsyncButton } from "@core/components/async-button";
import { ConfirmDialog } from "@core/components/confirm-dialog";
import { Badge } from "@core/components/ui/badge";
import { Button } from "@core/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@core/components/ui/table";
import { toast } from "@core/components/ui/sonner";
import { Copy, Logs, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@core/hooks/use-translation";
import {
  formatTimestamp,
  summarizeHealth,
  toActionSummary,
  toTriggerLabel,
} from "./rule-helpers";
import type {
  RuleDeliveryDto,
  RuleDto,
  EventTypeDto,
} from "./types";

type RulesTableProps = {
  loading: boolean;
  rules: RuleDto[];
  eventTypes: EventTypeDto[];
  deliveryHealth: Record<string, RuleDeliveryDto | undefined>;
  deletingRuleId: string | null;
  onCreateRule: () => void;
  onEditRule: (rule: RuleDto) => void;
  onViewDeliveries: (rule: RuleDto) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
};

export function RulesTable({
  loading,
  rules,
  eventTypes,
  deliveryHealth,
  deletingRuleId,
  onCreateRule,
  onEditRule,
  onViewDeliveries,
  onDeleteRule,
}: RulesTableProps) {
  const { t, language } = useTranslation();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t`ID`}</TableHead>
            <TableHead>{t`Name`}</TableHead>
            <TableHead>{t`Trigger`}</TableHead>
            <TableHead>{t`Actions`}</TableHead>
            <TableHead>{t`Status`}</TableHead>
            <TableHead>{t`Delivery health`}</TableHead>
            <TableHead>{t`Updated`}</TableHead>
            <TableHead className="text-right">{t`Actions`}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={8}>{t`Loading rules...`}</TableCell>
            </TableRow>
          ) : rules.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="p-6">
                <div className="flex min-h-56 items-center justify-center px-6 py-10">
                  <div className="mx-auto max-w-xl text-center">
                    <h3 className="text-base font-semibold">
                      {t`No webhooks or rules yet`}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t`Create a rule to send webhooks or trigger email automations when supported events happen.`}
                    </p>
                    <Button className="mt-5" onClick={onCreateRule}>
                      <Plus className="size-4" />
                      {t`Create rule`}
                    </Button>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rules.map((rule) => {
              const health = summarizeHealth(deliveryHealth[rule.id], t);
              return (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="font-mono text-xs hover:underline cursor-pointer"
                        onClick={() => onEditRule(rule)}
                      >
                        {rule.id.slice(0, 6)}...{rule.id.slice(-6)}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t`Copy rule ID`}
                        title={t`Copy rule ID`}
                        onClick={() => {
                          navigator.clipboard.writeText(rule.id);
                          toast.success(t`Rule ID copied to clipboard`);
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <button
                      type="button"
                      className="text-left hover:underline cursor-pointer"
                      onClick={() => onEditRule(rule)}
                    >
                      {rule.name}
                    </button>
                  </TableCell>
                  <TableCell>{toTriggerLabel(rule, eventTypes, t)}</TableCell>
                  <TableCell>{toActionSummary(rule.actions, t)}</TableCell>
                  <TableCell>
                    <Badge variant={rule.enabled ? "success" : "outline"}>
                      {rule.enabled ? t`Enabled` : t`Disabled`}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={health.variant}>{health.label}</Badge>
                  </TableCell>
                  <TableCell>{formatTimestamp(rule.updatedAt ?? rule.createdAt, t, language)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <AsyncButton
                        variant="ghost"
                        size="icon"
                        aria-label={t`View deliveries`}
                        title={t`View deliveries`}
                        onClick={async () => await onViewDeliveries(rule)}
                      >
                        <Logs className="size-4" />
                      </AsyncButton>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t`Edit rule`}
                        title={t`Edit rule`}
                        onClick={() => onEditRule(rule)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <ConfirmDialog
                        title={t`Delete rule`}
                        description={t`Are you sure you want to delete this rule? This action cannot be undone.`}
                        confirmButtonText={t`Delete`}
                        onConfirm={async () => await onDeleteRule(rule.id)}
                        isLoading={deletingRuleId === rule.id}
                        variant="destructive"
                        trigger={
                          <Button
                            variant="ghost-destructive"
                            size="icon"
                            aria-label={t`Delete rule`}
                            title={t`Delete rule`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
