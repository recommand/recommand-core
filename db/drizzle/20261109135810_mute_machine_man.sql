CREATE TYPE "public"."oauth_client_kinds" AS ENUM('dynamic');--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"allowed_permissions" text[],
	"client_uri" text,
	"disabled_at" timestamp with time zone,
	"grant_types" text[] NOT NULL,
	"kind" "oauth_client_kinds" NOT NULL,
	"logo_uri" text,
	"metadata_fetched_at" timestamp with time zone,
	"name" text,
	"redirect_uris" text[] NOT NULL,
	"token_endpoint_auth_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
