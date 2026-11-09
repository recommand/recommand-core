CREATE TABLE "oauth_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resources" text[] NOT NULL,
	"grant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resources" text[] NOT NULL,
	"used_at" timestamp with time zone,
	"grant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "reused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "grant_id" text;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_grant_id_idx" ON "oauth_access_tokens" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_grant_id_idx" ON "oauth_refresh_tokens" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_grant_id_oauth_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE cascade ON UPDATE no action;