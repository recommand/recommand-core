import { type AuthenticatedTeamContext, type AuthenticatedUserContext } from "@core/lib/auth-middleware";
import { type Context } from "@recommand/lib/api";
import { z } from "zod";
import "zod-openapi/extend";
import {
  createRuleApiSchema,
  updateRuleSchema,
  type EventTypeDefinition,
} from "../../lib/rules/types";

export const listRulesQuerySchema = z.object({
  eventType: z.string().nullish().openapi({
    description: "Filter by exact event type.",
  }),
  actionType: z.enum(["webhook", "email"]).nullish().openapi({
    description: "Filter by action type.",
  }),
  enabled: z.enum(["true", "false"]).nullish().openapi({
    description: "Filter by enabled state.",
  }),
});

export const teamIdParamSchema = z.object({
  teamId: z.string(),
});

export const listRuleDeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const ruleIdParamSchema = z.object({
  id: z.string().openapi({
    description: "The rule ID.",
  }),
});

export const ruleIdParamSchemaWithTeamId = ruleIdParamSchema.extend({
  teamId: z.string(),
});

export const deliveryParamSchema = z.object({
  id: z.string().openapi({
    description: "The rule ID.",
  }),
  ruleActionDeliveryId: z.string().openapi({
    description: "The rule action delivery ID.",
  }),
});

export const deliveryParamSchemaWithTeamId = deliveryParamSchema.extend({
  teamId: z.string(),
});

export const ruleActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("webhook"),
    version: z.literal(1),
    config: z.object({
      url: z.string().url(),
      secret: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("email"),
    version: z.literal(1),
    config: z.object({
      to: z.array(z.string().email()),
      attach: z.record(z.boolean()).optional(),
    }),
  }),
]);

export const versionedConditionResponseSchema = z.object({
  version: z.literal(1),
  match: z.record(
    z.object({
      eq: z.unknown().optional(),
      neq: z.unknown().optional(),
      in: z.array(z.unknown()).optional(),
      notIn: z.array(z.unknown()).optional(),
      contains: z.unknown().optional(),
      exists: z.boolean().optional(),
    })
  ),
});

export const ruleResponseSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  eventType: z.string(),
  condition: versionedConditionResponseSchema.nullable(),
  actions: z.array(ruleActionSchema),
  schemaVersion: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
});

export const ruleDeliveryResponseSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  actionIndex: z.number().int(),
  actionType: z.string(),
  actionVersion: z.number().int(),
  eventId: z.string(),
  eventType: z.string(),
  teamId: z.string(),
  idempotencyKey: z.string(),
  payload: z.unknown(),
  status: z.enum(["pending", "in_flight", "succeeded", "failed", "giving_up"]),
  attempts: z.number().int(),
  retryAt: z.coerce.date(),
  lockedUntil: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
  lastResponseStatus: z.number().int().nullable(),
  processedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const ruleDeliveriesListResponseSchema = z.object({
  deliveries: z.array(ruleDeliveryResponseSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  pageCount: z.number().int(),
});

export const conditionFieldResponseSchema = z.object({
  path: z.string(),
  label: z.string(),
  valueType: z.enum(["string", "number", "boolean", "date", "string[]", "enum"]),
  operators: z.array(z.enum(["eq", "neq", "in", "notIn", "contains", "exists"])),
  enumValues: z.array(z.string()).optional(),
  picker: z.string().optional(),
});

export const eventTypeResponseSchema = z.object({
  type: z.string(),
  aggregateType: z.string(),
  conditionFields: z.array(conditionFieldResponseSchema),
  email: z.object({
    template: z.string(),
    attachments: z.array(z.object({
      key: z.string(),
      label: z.string(),
      description: z.string().optional(),
    })).optional(),
  }).optional(),
  webhook: z.object({
    eventType: z.string(),
  }).optional(),
  ui: z.object({
    label: z.string(),
    description: z.string().optional(),
    group: z.string().optional(),
  }).optional(),
});

export const eventTypeParamSchema = z.object({
  type: z.string().openapi({
    description: "The event type.",
  }),
});

export const eventTypeParamSchemaWithTeamId = eventTypeParamSchema.extend({
  teamId: z.string(),
});

type SharedContext = AuthenticatedUserContext & AuthenticatedTeamContext;

export type ListRulesContext = Context<
  SharedContext,
  string,
  {
    in: {
      query: z.input<typeof listRulesQuerySchema>;
      param: z.input<typeof teamIdParamSchema>;
    };
    out: {
      query: z.infer<typeof listRulesQuerySchema>;
      param: z.infer<typeof teamIdParamSchema>;
    };
  }
>;

export type CreateRuleContext = Context<
  SharedContext,
  string,
  {
    in: {
      json: z.input<typeof createRuleApiSchema>;
      param: z.input<typeof teamIdParamSchema>;
    };
    out: {
      json: z.infer<typeof createRuleApiSchema>;
      param: z.infer<typeof teamIdParamSchema>;
    };
  }
>;

export type RuleContext = Context<
  SharedContext,
  string,
  {
    in: {
      param: z.input<typeof ruleIdParamSchemaWithTeamId>;
    };
    out: {
      param: z.infer<typeof ruleIdParamSchemaWithTeamId>;
    };
  }
>;

export type ListRuleDeliveriesContext = Context<
  SharedContext,
  string,
  {
    in: {
      param: z.input<typeof ruleIdParamSchemaWithTeamId>;
      query: z.input<typeof listRuleDeliveriesQuerySchema>;
    };
    out: {
      param: z.infer<typeof ruleIdParamSchemaWithTeamId>;
      query: z.infer<typeof listRuleDeliveriesQuerySchema>;
    };
  }
>;

export type UpdateRuleContext = Context<
  SharedContext,
  string,
  {
    in: {
      param: z.input<typeof ruleIdParamSchemaWithTeamId>;
      json: z.input<typeof updateRuleSchema>;
    };
    out: {
      param: z.infer<typeof ruleIdParamSchemaWithTeamId>;
      json: z.infer<typeof updateRuleSchema>;
    };
  }
>;

export type DeliveryContext = Context<
  SharedContext,
  string,
  {
    in: {
      param: z.input<typeof deliveryParamSchemaWithTeamId>;
    };
    out: {
      param: z.infer<typeof deliveryParamSchemaWithTeamId>;
    };
  }
>;

export type ListEventTypesContext = Context<
  SharedContext,
  string,
  {
    in: {
      param: z.input<typeof teamIdParamSchema>;
    };
    out: {
      param: z.infer<typeof teamIdParamSchema>;
    };
  }
>;

export type GetEventTypeContext = Context<
  SharedContext,
  string,
  {
    in: {
      param: z.input<typeof eventTypeParamSchemaWithTeamId>;
    };
    out: {
      param: z.infer<typeof eventTypeParamSchemaWithTeamId>;
    };
  }
>;

export function mapEventTypeDefinition(definition: EventTypeDefinition) {
  return {
    type: definition.type,
    aggregateType: definition.aggregateType,
    conditionFields: definition.conditionFields,
    email: definition.email
      ? {
          template: definition.email.template,
          attachments: definition.email.attachments,
        }
      : undefined,
    webhook: definition.webhook
      ? { eventType: definition.webhook.eventType }
      : undefined,
    ui: definition.ui,
  };
}
