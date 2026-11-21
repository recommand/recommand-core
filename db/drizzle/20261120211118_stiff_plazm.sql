CREATE TYPE "public"."oauth_client_kinds" AS ENUM('dynamic');--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_uri" text,
	"grant_types" text[] NOT NULL,
	"kind" "oauth_client_kinds" NOT NULL,
	"logo_uri" text,
	"name" text,
	"redirect_uris" text[] NOT NULL,
	"token_endpoint_auth_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
