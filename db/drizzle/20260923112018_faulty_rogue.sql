CREATE TABLE "event_projection_bootstraps" (
	"team_id" text NOT NULL,
	"consumer_id" text NOT NULL,
	"projection_key" text NOT NULL,
	"as_of_seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_projection_bootstraps_team_id_consumer_id_projection_key_pk" PRIMARY KEY("team_id","consumer_id","projection_key")
);
--> statement-breakpoint
ALTER TABLE "event_projection_bootstraps" ADD CONSTRAINT "event_projection_bootstraps_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;