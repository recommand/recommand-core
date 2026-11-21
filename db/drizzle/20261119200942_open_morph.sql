CREATE TYPE "public"."idempotency_key_status" AS ENUM('in_progress', 'completed', 'outcome_unknown');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"key" text NOT NULL,
	"response_body" text,
	"response_content_type" text,
	"response_status" integer,
	"scope" text NOT NULL,
	"status" "idempotency_key_status" DEFAULT 'in_progress' NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_team_scope_key_idx" ON "idempotency_keys" USING btree ("team_id","scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");