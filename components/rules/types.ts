import type { BreadcrumbItem } from "@core/components/page-template";
import type {
  EventFieldOperator,
  VersionedAction,
  VersionedCondition,
} from "../../lib/rules/types";
import type {
  ConditionFieldDefinition,
  ConditionPickerOptions,
} from "./condition-fields/types";

export type RuleDto = {
  id: string;
  teamId: string;
  name: string;
  enabled: boolean;
  eventType: string;
  condition: VersionedCondition | null;
  actions: VersionedAction[];
  schemaVersion: number;
  createdAt: string;
  updatedAt: string | null;
};

export type RuleDeliveryDto = {
  id: string;
  ruleId: string;
  actionIndex: number;
  actionType: string;
  actionVersion: number;
  eventId: string;
  eventType: string;
  teamId: string;
  idempotencyKey: string;
  payload: unknown;
  status: "pending" | "in_flight" | "succeeded" | "failed" | "giving_up";
  attempts: number;
  retryAt: string;
  lockedUntil: string | null;
  lastError: string | null;
  lastResponseStatus: number | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RuleDeliveriesPageDto = {
  deliveries: RuleDeliveryDto[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export type EventTypeDto = {
  type: string;
  aggregateType: string;
  conditionFields: ConditionFieldDefinition[];
  email?: {
    template: string;
    attachments?: Array<{
      key: string;
      label: string;
      description?: string;
    }>;
  };
  webhook?: {
    eventType: string;
  };
  ui?: {
    label: string;
    description?: string;
    group?: string;
  };
};

export type RuleConditionRow = {
  id: string;
  path: string;
  operator: EventFieldOperator;
  value: unknown;
};

export type RuleEditorDraft = {
  id?: string;
  name: string;
  enabled: boolean;
  eventType: string;
  conditionRows: RuleConditionRow[];
  actions: VersionedAction[];
};

export type RulesManagementPageProps = {
  title: string;
  description: string;
  breadcrumbs: BreadcrumbItem[];
  conditionOptions?: ConditionPickerOptions;
};
