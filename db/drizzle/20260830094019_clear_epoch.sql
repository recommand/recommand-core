ALTER TABLE "event_dead_letters" ADD COLUMN "event_occurred_at" timestamp with time zone;--> statement-breakpoint
UPDATE "event_dead_letters" SET "event_occurred_at" = ("event"->>'createdAt')::timestamptz WHERE "event_occurred_at" IS NULL;--> statement-breakpoint
ALTER TABLE "event_dead_letters" ALTER COLUMN "event_occurred_at" SET NOT NULL;
