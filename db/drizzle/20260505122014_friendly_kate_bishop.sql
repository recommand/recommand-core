CREATE TYPE "public"."rule_delivery_status" AS ENUM('pending', 'in_flight', 'succeeded', 'failed', 'giving_up');--> statement-breakpoint
CREATE TABLE "rule_action_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"action_index" integer NOT NULL,
	"action_type" text NOT NULL,
	"action_version" integer NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"team_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "rule_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"last_response_status" integer,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"event_type" text NOT NULL,
	"condition" jsonb,
	"actions" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule_action_deliveries" ADD CONSTRAINT "rule_action_deliveries_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rule_action_deliveries_idem" ON "rule_action_deliveries" USING btree ("event_id","rule_id","action_index");--> statement-breakpoint
CREATE INDEX "rule_action_deliveries_ready_idx" ON "rule_action_deliveries" USING btree ("status","retry_at");--> statement-breakpoint
CREATE INDEX "rules_team_event_idx" ON "rules" USING btree ("team_id","event_type","enabled");
