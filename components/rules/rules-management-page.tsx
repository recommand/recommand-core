import { PageTemplate } from "@core/components/page-template";
import { Button } from "@core/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@core/components/ui/card";
import { toast } from "@core/components/ui/sonner";
import { useActiveTeam } from "@core/hooks/user";
import { stringifyActionFailure } from "@recommand/lib/utils";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { RuleDeliveriesDialog } from "./rule-deliveries-dialog";
import { RuleEditorDialog } from "./rule-editor-dialog";
import {
  emptyEmailAction,
  emptyWebhookAction,
  wildcardEventType,
} from "./rule-constants";
import {
  buildCondition,
  buildRecipientInputs,
  flattenCondition,
  toTriggerLabel,
} from "./rule-helpers";
import { requestJson } from "./rules-api";
import { RulesFilters } from "./rules-filters";
import { RulesTable } from "./rules-table";
import type {
  RuleDeliveryDto,
  RuleDeliveriesPageDto,
  RuleDto,
  RuleEditorDraft,
  EventTypeDto,
  RulesManagementPageProps,
} from "./types";

export function RulesManagementPage({
  title,
  description,
  breadcrumbs,
  conditionOptions,
}: RulesManagementPageProps) {
  const [rules, setRules] = useState<RuleDto[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeDto[]>([]);
  const [deliveryHealth, setDeliveryHealth] = useState<Record<string, RuleDeliveryDto | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleDto | null>(null);
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const [deliveriesRule, setDeliveriesRule] = useState<RuleDto | null>(null);
  const [deliveries, setDeliveries] = useState<RuleDeliveryDto[]>([]);
  const [deliveriesPage, setDeliveriesPage] = useState(1);
  const [deliveriesPageCount, setDeliveriesPageCount] = useState(1);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [recipientInputs, setRecipientInputs] = useState<Record<number, string>>({});
  const activeTeam = useActiveTeam();
  const [draft, setDraft] = useState<RuleEditorDraft>({
    name: "",
    enabled: true,
    eventType: "",
    conditionRows: [],
    actions: [structuredClone(emptyWebhookAction)],
  });

  const availableEventTypes = eventTypes;
  const wildcardAvailable = availableEventTypes.some((eventType) => Boolean(eventType.webhook));
  const selectedEventType = availableEventTypes.find((eventType) => eventType.type === draft.eventType);

  async function fetchRulesAndMetadata() {
    if (!activeTeam?.id) {
      setRules([]);
      setEventTypes([]);
      setDeliveryHealth({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const teamPath = `/${activeTeam.id}`;
      const [rulesJson, eventTypesJson] = await Promise.all([
        requestJson(`${teamPath}/rules`),
        requestJson(`${teamPath}/event-types`),
      ]);

      if (!rulesJson.success) {
        throw new Error(stringifyActionFailure(rulesJson.errors));
      }
      if (!eventTypesJson.success) {
        throw new Error(stringifyActionFailure(eventTypesJson.errors));
      }

      setRules(rulesJson.rules as RuleDto[]);
      setEventTypes(eventTypesJson.eventTypes as EventTypeDto[]);

      const deliveryEntries = await Promise.all(
        (rulesJson.rules as RuleDto[]).map(async (rule) => {
          const json = await requestJson(
            `${teamPath}/rules/${rule.id}/deliveries?page=1&limit=1`
          );
          return [
            rule.id,
            json.success ? (json.deliveries as RuleDeliveryDto[])[0] : undefined,
          ] as const;
        })
      );

      setDeliveryHealth(Object.fromEntries(deliveryEntries));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load rules and event metadata");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDeliveries(rule: RuleDto, page: number = 1) {
    if (!activeTeam?.id) {
      return;
    }

    try {
      const json = await requestJson(`/${activeTeam.id}/rules/${rule.id}/deliveries?page=${page}&limit=25`);
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      const result = json as { success: true } & RuleDeliveriesPageDto;
      setDeliveries(result.deliveries);
      setDeliveriesPage(result.page);
      setDeliveriesPageCount(result.pageCount);
      setDeliveriesTotal(result.total);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load deliveries");
    }
  }

  useEffect(() => {
    fetchRulesAndMetadata();
  }, [activeTeam?.id]);

  const visibleRules = rules.filter((rule) => {
    const matchesSearch =
      globalFilter.trim().length === 0 ||
      rule.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
      toTriggerLabel(rule, availableEventTypes)
        .toLowerCase()
        .includes(globalFilter.toLowerCase());

    const matchesEventType =
      eventTypeFilter === "all" || rule.eventType === eventTypeFilter;

    const matchesActionType =
      actionTypeFilter === "all" ||
      rule.actions.some((action) => action.type === actionTypeFilter);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "enabled" ? rule.enabled : !rule.enabled);

    return (
      matchesSearch &&
      matchesEventType &&
      matchesActionType &&
      matchesStatus
    );
  });

  function openCreateDialog() {
    const actions = [structuredClone(emptyWebhookAction)];
    setEditingRule(null);
    setDraft({
      name: "",
      enabled: true,
      eventType: availableEventTypes[0]?.type ?? "",
      conditionRows: [],
      actions,
    });
    setRecipientInputs(buildRecipientInputs(actions));
    setEditorOpen(true);
  }

  function openEditDialog(rule: RuleDto) {
    const actions = structuredClone(rule.actions);
    setEditingRule(rule);
    setDraft({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      eventType: rule.eventType,
      conditionRows: flattenCondition(rule.condition),
      actions,
    });
    setRecipientInputs(buildRecipientInputs(actions));
    setEditorOpen(true);
  }

  function addConditionRow() {
    const field = selectedEventType?.conditionFields[0];
    if (!field) {
      return;
    }

    setDraft((current) => ({
      ...current,
      conditionRows: [
        ...current.conditionRows,
        {
          id: crypto.randomUUID(),
          path: field.path,
          operator: field.operators[0] ?? "eq",
          value: field.valueType === "boolean" ? false : "",
        },
      ],
    }));
  }

  function resetDraftForEventType(nextEventType: string) {
    if (nextEventType === wildcardEventType) {
      const actions = [structuredClone(emptyWebhookAction)];
      setDraft((current) => ({
        ...current,
        eventType: nextEventType,
        conditionRows: [],
        actions,
      }));
      setRecipientInputs(buildRecipientInputs(actions));
      return;
    }

    const eventType = availableEventTypes.find((entry) => entry.type === nextEventType);
    setDraft((current) => {
      const actions =
        current.eventType === wildcardEventType
          ? [eventType?.email ? structuredClone(emptyEmailAction) : structuredClone(emptyWebhookAction)]
          : current.actions.filter((action) => action.type !== "email" || Boolean(eventType?.email));

      setRecipientInputs(buildRecipientInputs(actions));

      return {
        ...current,
        eventType: nextEventType,
        conditionRows: current.eventType === nextEventType ? current.conditionRows : [],
        actions,
      };
    });
  }

  async function saveRule() {
    if (!activeTeam?.id) {
      toast.error("No active team selected");
      return;
    }

    const payload = {
      name: draft.name,
      enabled: draft.enabled,
      eventType: draft.eventType,
      condition: draft.eventType === wildcardEventType ? null : buildCondition(draft.conditionRows),
      actions: draft.actions,
    };

    try {
      const json = editingRule
        ? await requestJson(`/${activeTeam.id}/rules/${editingRule.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await requestJson(`/${activeTeam.id}/rules`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      toast.success(editingRule ? "Rule updated successfully" : "Rule created successfully");
      setEditorOpen(false);
      await fetchRulesAndMetadata();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to save rule");
    }
  }

  async function deleteRule(ruleId: string) {
    if (!activeTeam?.id) {
      toast.error("No active team selected");
      return;
    }

    setDeletingRuleId(ruleId);
    try {
      const json = await requestJson(`/${activeTeam.id}/rules/${ruleId}`, {
        method: "DELETE",
      });
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      toast.success("Rule deleted successfully");
      await fetchRulesAndMetadata();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete rule");
    } finally {
      setDeletingRuleId((current) => (current === ruleId ? null : current));
    }
  }

  async function retryDelivery(ruleId: string, deliveryId: string) {
    if (!activeTeam?.id) {
      toast.error("No active team selected");
      return;
    }

    try {
      const json = await requestJson(
        `/${activeTeam.id}/rules/${ruleId}/deliveries/${deliveryId}/retry`,
        {
          method: "POST",
        }
      );
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      toast.success("Delivery queued");
      if (deliveriesRule) {
        await fetchDeliveries(deliveriesRule, deliveriesPage);
      }
      await fetchRulesAndMetadata();
    } catch (error) {
      console.error(error);
      toast.error("Failed to requeue delivery");
    }
  }

  async function openDeliveriesDialog(rule: RuleDto) {
    setDeliveriesRule(rule);
    setDeliveries([]);
    setDeliveriesPage(1);
    setDeliveriesPageCount(1);
    setDeliveriesTotal(0);
    setDeliveriesOpen(true);
    await fetchDeliveries(rule, 1);
  }

  const pageButtons = [
    <Button key="create-rule" onClick={openCreateDialog}>
      <Plus className="size-4" />
      Create rule
    </Button>,
  ];

  return (
    <PageTemplate
      breadcrumbs={breadcrumbs}
      title={title}
      description={description}
      buttons={pageButtons}
    >
      <Card>
        <CardHeader>
          <CardTitle>Webhooks and rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RulesFilters
            globalFilter={globalFilter}
            eventTypeFilter={eventTypeFilter}
            actionTypeFilter={actionTypeFilter}
            statusFilter={statusFilter}
            eventTypes={availableEventTypes}
            wildcardAvailable={wildcardAvailable}
            onGlobalFilterChange={setGlobalFilter}
            onEventTypeFilterChange={setEventTypeFilter}
            onActionTypeFilterChange={setActionTypeFilter}
            onStatusFilterChange={setStatusFilter}
          />

          <RulesTable
            loading={loading}
            rules={visibleRules}
            eventTypes={availableEventTypes}
            deliveryHealth={deliveryHealth}
            deletingRuleId={deletingRuleId}
            onCreateRule={openCreateDialog}
            onEditRule={openEditDialog}
            onViewDeliveries={openDeliveriesDialog}
            onDeleteRule={deleteRule}
          />
        </CardContent>
      </Card>

      <RuleEditorDialog
        open={editorOpen}
        editingRule={editingRule}
        draft={draft}
        eventTypes={availableEventTypes}
        selectedEventType={selectedEventType}
        wildcardAvailable={wildcardAvailable}
        conditionOptions={conditionOptions}
        recipientInputs={recipientInputs}
        onOpenChange={setEditorOpen}
        onEventTypeChange={resetDraftForEventType}
        onAddConditionRow={addConditionRow}
        onSaveRule={saveRule}
        setDraft={setDraft}
        setRecipientInputs={setRecipientInputs}
      />

      <RuleDeliveriesDialog
        open={deliveriesOpen}
        deliveriesRule={deliveriesRule}
        deliveries={deliveries}
        deliveriesPage={deliveriesPage}
        deliveriesPageCount={deliveriesPageCount}
        deliveriesTotal={deliveriesTotal}
        onOpenChange={setDeliveriesOpen}
        onFetchDeliveries={fetchDeliveries}
        onRetryDelivery={retryDelivery}
      />
    </PageTemplate>
  );
}
