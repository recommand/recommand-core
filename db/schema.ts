import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
