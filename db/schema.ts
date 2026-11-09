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

export const sessions = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "ses_" + ulid()),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

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

export const principalTypes = pgEnum("principal_types", ["api_key", "installation", "oauth_grant"]);

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

export const oauthClientKinds = pgEnum("oauth_client_kinds", ["dynamic"]);

export const oauthClients = pgTable("oauth_clients", {
  // A metadata document's URL, or the ID this server gives a registered client:
  // it can't choose one, so none looks like a URL or like a client this server
  // knows from elsewhere
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "dcr_" + ulid()),
  // Null: every permission a client of this kind may be granted
  allowedPermissions: text("allowed_permissions").array(),
  clientUri: text("client_uri"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  grantTypes: text("grant_types").notNull().array().notNull(),
  kind: oauthClientKinds("kind").notNull(),
  logoUri: text("logo_uri"),
  // When the stored copy was last checked against the client's metadata document
  metadataFetchedAt: timestamp("metadata_fetched_at", { withTimezone: true }),
  name: text("name"),
  redirectUris: text("redirect_uris").notNull().array().notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
});

// A code is stored hashed and used once; the grant is only made when it is
// exchanged, so consent that is never completed leaves no grant behind
export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  codeHash: text("code_hash").primaryKey(),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  permissionIds: text("permission_ids").notNull().array().notNull(),
  redirectUri: text("redirect_uri").notNull(),
  resources: text("resources").notNull().array().notNull(),
  // Set when a code is presented again before its grant was recorded
  reusedAt: timestamp("reused_at", { withTimezone: true }),
  teamIds: text("team_ids").notNull().array().notNull(),
  // A used code is kept, so presenting it again deletes the grant it was
  // exchanged for
  usedAt: timestamp("used_at", { withTimezone: true }),

  clientId: text("client_id")
    .references(() => oauthClients.id, { onDelete: "cascade" })
    .notNull(),
  grantId: text("grant_id").references(() => oauthGrants.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Who a grant acts for: the user who consented
export const oauthGrantPrincipalTypes = pgEnum("oauth_grant_principal_types", ["user"]);

// The teams and permissions of a grant are its `principal_permissions` rows
export const oauthGrants = pgTable("oauth_grants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "grt_" + ulid()),
  principalType: oauthGrantPrincipalTypes("principal_type").notNull(),

  clientId: text("client_id")
    .references(() => oauthClients.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
});

// Tokens are stored hashed. An access token lasts an hour at most, and is checked
// against this table on every request, so revoking its grant ends it at once.
export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resources: text("resources").notNull().array().notNull(),

    grantId: text("grant_id")
      .references(() => oauthGrants.id, { onDelete: "cascade" })
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("oauth_access_tokens_grant_id_idx").on(table.grantId)]
);

// A refresh token is replaced on every use; `used_at` keeps the replaced ones,
// so presenting one again is recognized as a stolen token
export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resources: text("resources").notNull().array().notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),

    grantId: text("grant_id")
      .references(() => oauthGrants.id, { onDelete: "cascade" })
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("oauth_refresh_tokens_grant_id_idx").on(table.grantId)]
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
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "rul_" + ulid()),
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
