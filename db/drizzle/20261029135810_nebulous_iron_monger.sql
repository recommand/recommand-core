DO $migration$
BEGIN
  IF to_regclass('public.principal_permissions') IS NULL THEN
CREATE TYPE "public"."principal_types" AS ENUM('api_key', 'installation');

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


ALTER TABLE "principal_permissions" ADD CONSTRAINT "principal_permissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "principal_permissions_principal_idx" ON "principal_permissions" USING btree ("principal_type","principal_id","team_id");

INSERT INTO "principal_permissions" ("principal_type", "principal_id", "team_id", "permission_id", "granted_by_user_id")
SELECT 'api_key', keys."id", keys."team_id", permissions."permission_id", keys."user_id"
FROM "api_keys" AS keys
INNER JOIN "user_permissions" AS permissions
ON permissions."user_id" = keys."user_id" AND permissions."team_id" = keys."team_id"
ON CONFLICT DO NOTHING;

INSERT INTO "principal_permissions" ("principal_type", "principal_id", "team_id", "permission_id", "granted_by_user_id")
SELECT 'api_key', keys."id", keys."team_id", 'core.team.manage', keys."user_id"
FROM "api_keys" AS keys
INNER JOIN "users" ON "users"."id" = keys."user_id"
WHERE "users"."is_admin" = true
ON CONFLICT DO NOTHING;
  END IF;
END $migration$;
