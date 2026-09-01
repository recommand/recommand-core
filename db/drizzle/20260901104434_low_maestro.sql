CREATE TYPE "public"."event_data_locations" AS ENUM('none', 'db', 's3');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "data_location" "event_data_locations" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "data_s3_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "data_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "data_offload_claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "events_data_offload_idx" ON "events" USING btree ("data_location","data_size_bytes","created_at","data_offload_claimed_at");