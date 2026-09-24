CREATE TABLE "event_projection_bootstrap_failures" (
	"team_id" text NOT NULL,
	"consumer_id" text NOT NULL,
	"projection_key" text NOT NULL,
	"item_id" text NOT NULL,
	"error" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_projection_bootstrap_failures_pk" PRIMARY KEY("team_id","consumer_id","projection_key","item_id")
);
--> statement-breakpoint
ALTER TABLE "event_projection_bootstrap_failures" ADD CONSTRAINT "event_projection_bootstrap_failures_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;