ALTER TABLE "event_cursors" DROP CONSTRAINT "event_cursors_team_id_consumer_id_stream_id_pk";--> statement-breakpoint
ALTER TABLE "event_cursors" ADD CONSTRAINT "event_cursors_team_id_consumer_id_pk" PRIMARY KEY("team_id","consumer_id");--> statement-breakpoint
ALTER TABLE "event_cursors" DROP COLUMN "stream_id";