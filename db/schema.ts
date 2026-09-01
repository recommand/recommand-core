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
  language: text("language").default("en").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
});

export const userPermissions = pgTable("user_permissions", {
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }).notNull(),
  permissionId: text("permission_id").notNull(),
  grantedByUserId: text("granted_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
}, (table) => [primaryKey({ columns: [table.userId, table.teamId, table.permissionId] })]);

export const userGlobalPermissions = pgTable("user_global_permissions", {
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  permissionId: text("permission_id").notNull(),
  grantedByUserId: text("granted_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
}, (table) => [primaryKey({ columns: [table.userId, table.permissionId] })]);

export const teams = pgTable("teams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "team_" + ulid()),
  name: text("name").notNull(),
  teamDescription: text("team_description").notNull().default("-"),
  logoUrl: text("logo_url"),
  clientAssertionJwks: text("client_assertion_jwks"),
  language: text("language").default("en").notNull(),
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

export const auditEvents = pgTable("audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "aud_" + ulid()),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  action: text("action").notNull(),
  subsystem: text("subsystem").notNull(),
  outcome: text("outcome").notNull().default("allowed"),
  actorUserId: text("actor_user_id"),
  actorApiKeyId: text("actor_api_key_id"),
  actorIp: text("actor_ip"),
  actorUserAgent: text("actor_user_agent"),
  teamId: text("team_id"),
  objectType: text("object_type"),
  objectId: text("object_id"),
  reasonCode: text("reason_code"),
  requestId: text("request_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_events_occurred_at_idx").on(table.occurredAt),
  index("audit_events_actor_user_idx").on(table.actorUserId),
  index("audit_events_team_idx").on(table.teamId),
  index("audit_events_object_idx").on(table.objectType, table.objectId),
  index("audit_events_action_idx").on(table.action),
  index("audit_events_outcome_idx").on(table.outcome),
]);

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

export const installations = pgTable(
  "installations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "ins_" + ulid()),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [index("installations_team_idx").on(table.teamId)]
);

export const principalTypes = pgEnum("principal_types", ["api_key", "installation"]);

export const principalPermissions = pgTable(
  "principal_permissions",
  {
    principalType: principalTypes("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    permissionId: text("permission_id").notNull(),
    grantedByUserId: text("granted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.principalType,
        table.principalId,
        table.teamId,
        table.permissionId,
      ],
    }),
    index("principal_permissions_principal_idx").on(
      table.principalType,
      table.principalId,
      table.teamId
    ),
  ]
);

export const installationTokens = pgTable(
  "installation_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "it_" + ulid()),
    installationId: text("installation_id")
      .references(() => installations.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("installation_tokens_installation_idx").on(table.installationId)]
);

export const eventDataLocations = pgEnum("event_data_locations", [
  "none",
  "db",
  "s3",
]);

export const events = pgTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "ev_" + ulid()),
    seq: integer("seq").notNull(),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    streamId: text("stream_id").notNull().default(""),
    type: text("type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    correlationId: text("correlation_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    // Point-in-time snapshot captured when the event was published. Written
    // inline in the same transaction as the event row; large snapshots are
    // moved to S3 by a background worker (see data/event-data-offload.ts).
    // Null when dataLocation is "none" (no snapshot) or "s3" (offloaded).
    data: jsonb("data"),
    dataLocation: eventDataLocations("data_location").notNull().default("none"),
    dataS3Key: text("data_s3_key"),
    dataSizeBytes: integer("data_size_bytes"),
    dataOffloadClaimedAt: timestamp("data_offload_claimed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("events_team_seq_idx").on(table.teamId, table.seq),
    uniqueIndex("events_team_idempotency_idx").on(table.teamId, table.idempotencyKey),
    index("events_team_stream_seq_idx").on(table.teamId, table.streamId, table.seq),
    index("events_data_offload_idx").on(
      table.dataLocation,
      table.dataSizeBytes,
      table.createdAt,
      table.dataOffloadClaimedAt
    ),
  ]
);

export const eventCursors = pgTable(
  "event_cursors",
  {
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    consumerId: text("consumer_id").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.consumerId] })]
);

export const eventDeadLetters = pgTable(
  "event_dead_letters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "edl_" + ulid()),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    consumerId: text("consumer_id").notNull(),
    streamId: text("stream_id").notNull().default(""),
    eventId: text("event_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    eventOccurredAt: timestamp("event_occurred_at", { withTimezone: true }).notNull(),
    event: jsonb("event").notNull(),
    error: text("error").notNull(),
    attempts: integer("attempts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("event_dead_letters_consumer_event_idx").on(
      table.teamId,
      table.consumerId,
      table.streamId,
      table.eventId
    ),
    index("event_dead_letters_team_idx").on(table.teamId, table.createdAt),
  ]
);

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
