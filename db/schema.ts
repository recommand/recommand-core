import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { autoUpdateTimestamp } from "@recommand/db/custom-types";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "usr_" + ulid()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
});

export const teams = pgTable("teams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "team_" + ulid()),
  name: text("name").notNull(),
  teamDescription: text("team_description").notNull().default("-"),
  clientAssertionJwks: text("client_assertion_jwks"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })]
);

export const apiKeyTypes = pgEnum("api_key_types", ["basic", "jwt"]);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "key_" + ulid()),
    name: text("name").notNull(),
    type: apiKeyTypes("type").default("basic").notNull(),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [index("api_keys_secret_hash_idx").using("hash", table.secretHash)]
);

export const completedOnboardingSteps = pgTable(
  "completed_onboarding_steps",
  {
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.teamId, table.stepId] }),
  ]
);

export const ruleDeliveryStatusEnum = pgEnum("rule_delivery_status", [
  "pending",
  "in_flight",
  "succeeded",
  "failed",
  "giving_up",
]);

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .references(() => teams.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  eventType: text("event_type").notNull(),
  condition: jsonb("condition"),
  actions: jsonb("actions").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
}, (table) => [
  index("rules_team_event_idx").on(table.teamId, table.eventType, table.enabled),
]);

export const ruleActionDeliveries = pgTable("rule_action_deliveries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "rad_" + ulid()),
  ruleId: text("rule_id")
    .references(() => rules.id, { onDelete: "cascade" })
    .notNull(),
  actionIndex: integer("action_index").notNull(),
  actionType: text("action_type").notNull(),
  actionVersion: integer("action_version").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  teamId: text("team_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payload: jsonb("payload").notNull(),
  status: ruleDeliveryStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  retryAt: timestamp("retry_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastError: text("last_error"),
  lastResponseStatus: integer("last_response_status"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
}, (table) => [
  uniqueIndex("rule_action_deliveries_idem").on(
    table.eventId,
    table.ruleId,
    table.actionIndex
  ),
  index("rule_action_deliveries_ready_idx").on(table.status, table.retryAt),
]);
