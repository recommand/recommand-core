-- Backfill: grant `core.team.manage` to all existing team members.
-- Prior to the permissions system any team member could manage their team
-- (gated only by team membership). The permission is now only granted on
-- team creation, so members of teams that predate this migration would
-- otherwise lose team-management access. This preserves the previous behavior.
INSERT INTO "user_permissions" ("user_id", "team_id", "permission_id", "granted_by_user_id")
SELECT "user_id", "team_id", 'core.team.manage', NULL
FROM "team_members"
WHERE "user_id" IS NOT NULL AND "team_id" IS NOT NULL
ON CONFLICT ("user_id", "team_id", "permission_id") DO NOTHING;
