CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"subsystem" text NOT NULL,
	"outcome" text DEFAULT 'allowed' NOT NULL,
	"actor_user_id" text,
	"actor_api_key_id" text,
	"actor_ip" text,
	"actor_user_agent" text,
	"team_id" text,
	"object_type" text,
	"object_id" text,
	"reason_code" text,
	"request_id" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_team_idx" ON "audit_events" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "audit_events_object_idx" ON "audit_events" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_outcome_idx" ON "audit_events" USING btree ("outcome");
