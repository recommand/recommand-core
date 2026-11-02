CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'in_flight', 'sent', 'failed', 'giving_up', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('active', 'withdrawn');--> statement-breakpoint
CREATE TABLE "notification_action_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_action_tokens_notification_id_unique" UNIQUE("notification_id"),
	CONSTRAINT "notification_action_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"attempt_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"channels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb,
	"actions_enabled" boolean DEFAULT false NOT NULL,
	"require_login" boolean DEFAULT true NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "notification_status" DEFAULT 'active' NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"acted_at" timestamp with time zone,
	"acted_action" text,
	"acted_channel" text,
	"action_result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_action_tokens" ADD CONSTRAINT "notification_action_tokens_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_channel_idx" ON "notification_deliveries" USING btree ("notification_id","channel");--> statement-breakpoint
CREATE INDEX "notification_deliveries_ready_idx" ON "notification_deliveries" USING btree ("status","retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_idempotency_idx" ON "notifications" USING btree ("team_id","idempotency_key","user_id");--> statement-breakpoint
CREATE INDEX "notifications_team_key_idx" ON "notifications" USING btree ("team_id","key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");