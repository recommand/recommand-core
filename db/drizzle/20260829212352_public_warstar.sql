CREATE TABLE "event_cursors" (
	"team_id" text NOT NULL,
	"consumer_id" text NOT NULL,
	"stream_id" text DEFAULT '' NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_cursors_team_id_consumer_id_stream_id_pk" PRIMARY KEY("team_id","consumer_id","stream_id")
);
--> statement-breakpoint
CREATE TABLE "event_dead_letters" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"consumer_id" text NOT NULL,
	"stream_id" text DEFAULT '' NOT NULL,
	"event_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"event" jsonb NOT NULL,
	"error" text NOT NULL,
	"attempts" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"team_id" text NOT NULL,
	"stream_id" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"correlation_id" text,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_cursors" ADD CONSTRAINT "event_cursors_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_dead_letters" ADD CONSTRAINT "event_dead_letters_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_tokens" ADD CONSTRAINT "installation_tokens_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_dead_letters_consumer_event_idx" ON "event_dead_letters" USING btree ("team_id","consumer_id","stream_id","event_id");--> statement-breakpoint
CREATE INDEX "event_dead_letters_team_idx" ON "event_dead_letters" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_team_seq_idx" ON "events" USING btree ("team_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "events_team_idempotency_idx" ON "events" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "events_team_stream_seq_idx" ON "events" USING btree ("team_id","stream_id","seq");--> statement-breakpoint
CREATE INDEX "installation_tokens_installation_idx" ON "installation_tokens" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "installations_team_idx" ON "installations" USING btree ("team_id");