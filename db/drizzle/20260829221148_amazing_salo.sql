CREATE TYPE "public"."principal_types" AS ENUM('api_key', 'installation');--> statement-breakpoint
CREATE TABLE "principal_permissions" (
	"principal_type" "principal_types" NOT NULL,
	"principal_id" text NOT NULL,
	"team_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"granted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "principal_permissions_principal_type_principal_id_team_id_permission_id_pk" PRIMARY KEY("principal_type","principal_id","team_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "principal_permissions" ADD CONSTRAINT "principal_permissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "principal_permissions_principal_idx" ON "principal_permissions" USING btree ("principal_type","principal_id","team_id");--> statement-breakpoint
INSERT INTO "principal_permissions" ("principal_type", "principal_id", "team_id", "permission_id", "granted_by_user_id")
SELECT 'api_key', "api_keys"."id", "user_permissions"."team_id", "user_permissions"."permission_id", "api_keys"."user_id"
FROM "api_keys"
INNER JOIN "user_permissions" ON "user_permissions"."user_id" = "api_keys"."user_id" AND "user_permissions"."team_id" = "api_keys"."team_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "principal_permissions" ("principal_type", "principal_id", "team_id", "permission_id", "granted_by_user_id")
SELECT 'api_key', "api_keys"."id", "api_keys"."team_id", perms."permission_id", "api_keys"."user_id"
FROM "api_keys"
INNER JOIN "users" ON "users"."id" = "api_keys"."user_id"
CROSS JOIN (
	SELECT 'core.team.manage' AS "permission_id"
	UNION ALL SELECT 'core.installations.manage'
	UNION ALL SELECT 'core.events.read'
) AS perms
WHERE "users"."is_admin" = true
ON CONFLICT DO NOTHING;