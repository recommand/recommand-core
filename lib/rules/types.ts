import { z } from "zod";

export const conditionOperatorSchema = z.object({
  eq: z.unknown().optional(),
  neq: z.unknown().optional(),
  in: z.array(z.unknown()).optional(),
  notIn: z.array(z.unknown()).optional(),
  contains: z.unknown().optional(),
  exists: z.boolean().optional(),
}).refine(
  (value) =>
    value.eq !== undefined ||
    value.neq !== undefined ||
    value.in !== undefined ||
    value.notIn !== undefined ||
    value.contains !== undefined ||
    value.exists !== undefined,
  "At least one operator is required"
);

export const versionedConditionSchema = z.object({
  version: z.literal(1),
  match: z.record(conditionOperatorSchema),
});

export const webhookActionConfigSchema = z.object({
  url: z.string().url(),
  secret: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
});

export const emailActionConfigSchema = z.object({
  to: z.array(z.string().email()).min(1),
  attach: z.record(z.boolean()).optional(),
});

export const versionedActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("webhook"),
    version: z.literal(1),
    config: webhookActionConfigSchema,
  }),
  z.object({
    type: z.literal("email"),
    version: z.literal(1),
    config: emailActionConfigSchema,
  }),
]);

export const ruleSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string().min(1),
  enabled: z.boolean(),
  eventType: z.string().min(1),
  condition: versionedConditionSchema.nullable(),
  actions: z.array(versionedActionSchema).min(1),
  schemaVersion: z.literal(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
});

export const createRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  eventType: z.string().min(1),
  condition: versionedConditionSchema.nullish(),
  actions: z.array(versionedActionSchema).min(1),
});

export const createRuleApiSchema = createRuleSchema.omit({
  id: true,
});

export const updateRuleSchema = createRuleSchema.partial().extend({
  enabled: z.boolean().optional(),
});

export const eventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  teamId: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  correlationId: z.string().nullable(),
  idempotencyKey: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});

export type VersionedCondition = z.infer<typeof versionedConditionSchema>;
export type VersionedAction = z.infer<typeof versionedActionSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export type EventFieldOperator =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "contains"
  | "exists";

export type EventFieldValueType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "string[]"
  | "enum";

export type EventTypeDefinition = {
  type: string;
  aggregateType: string;
  payload: z.ZodTypeAny;
  conditionFields: Array<{
    path: string;
    label: string;
    valueType: EventFieldValueType;
    operators: EventFieldOperator[];
    enumValues?: string[];
    picker?: string;
  }>;
  webhook?: {
    eventType: string;
    project: (event: EventEnvelope) => Record<string, unknown>;
  };
  email?: {
    template: string;
    attachments?: Array<{
      key: string;
      label: string;
      description?: string;
    }>;
    buildProps?: (event: EventEnvelope) => Promise<object>;
    buildAttachments?: (
      event: EventEnvelope,
      attach: z.infer<typeof emailActionConfigSchema>["attach"]
    ) => Promise<Array<{
      Content: string;
      ContentID: string | null;
      ContentType: string;
      Name: string;
    }>>;
  };
  ui?: {
    label: string;
    description?: string;
    group?: string;
  };
};
