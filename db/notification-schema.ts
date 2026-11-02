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
import { teams, users } from "./schema";

// ---------------------------------------------------------------------------
// Notifications: messages to one user about one subject, their deliveries per
// channel, the users' channel choices and the action links. See
// docs/notifications.md.
// ---------------------------------------------------------------------------

export const notificationStatusEnum = pgEnum("notification_status", ["active", "withdrawn"]);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "ntf_" + ulid()),
    teamId: text("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    key: text("key").notNull(),
    data: jsonb("data"),
    actionsEnabled: boolean("actions_enabled").notNull().default(false),
    requireLogin: boolean("require_login").notNull().default(true),
    idempotencyKey: text("idempotency_key").notNull(),
    status: notificationStatusEnum("status").notNull().default("active"),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    // The action the user took from the message, if any.
    actedAt: timestamp("acted_at", { withTimezone: true }),
    actedAction: text("acted_action"),
    actedChannel: text("acted_channel"),
    actionResult: text("action_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [
    uniqueIndex("notifications_idempotency_idx").on(table.teamId, table.idempotencyKey, table.userId),
    index("notifications_team_key_idx").on(table.teamId, table.key),
    index("notifications_user_idx").on(table.userId, table.createdAt),
  ]
);

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending",
  "in_flight",
  "sent",
  "failed",
  "giving_up",
  "skipped",
]);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => "ntd_" + ulid()),
    notificationId: text("notification_id")
      .references(() => notifications.id, { onDelete: "cascade" })
      .notNull(),
    channel: text("channel").notNull(),
    status: notificationDeliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // Every attempt: when it ran, how it ended and the error, oldest first.
    attemptLog: jsonb("attempt_log")
      .$type<Array<{ at: string; status: "sent" | "failed"; error: string | null }>>()
      .notNull()
      .default([]),
    retryAt: timestamp("retry_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_channel_idx").on(table.notificationId, table.channel),
    index("notification_deliveries_ready_idx").on(table.status, table.retryAt),
  ]
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    channels: jsonb("channels").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: autoUpdateTimestamp(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind] })]
);

export const notificationActionTokens = pgTable("notification_action_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => "nat_" + ulid()),
  notificationId: text("notification_id")
    .references(() => notifications.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  // The channel whose message carries the link.
  channel: text("channel").notNull(),
  // A hash of the token's random part; the token itself is only in the message.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: autoUpdateTimestamp(),
});
