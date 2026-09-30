-- Cleanup: remove API keys whose creator is no longer a member of the key's team.
-- Removing a team member now also deletes their API keys in that team, and
-- session verification rejects keys whose creator left the team. Keys of members
-- removed before that change still exist: they are invisible to the team, cannot
-- be revoked by it, and would start working again if the creator were re-added.
-- Keys created by global admins are kept, since verification still accepts them.
-- The removed rows are kept in "tmp_api_keys_orphaned_backup" so they can be restored;
-- drop that table once it is no longer needed, as it holds secret hashes.
CREATE TABLE "tmp_api_keys_orphaned_backup" AS
SELECT k.*, now() AS "removed_at"
FROM "api_keys" k
JOIN "users" u ON u."id" = k."user_id"
WHERE NOT u."is_admin"
  AND NOT EXISTS (
    SELECT 1
    FROM "team_members" m
    WHERE m."user_id" = k."user_id" AND m."team_id" = k."team_id"
  );

INSERT INTO "audit_events" ("id", "action", "subsystem", "team_id", "object_type", "object_id", "reason_code", "before", "metadata")
SELECT
  'aud_' || replace(gen_random_uuid()::text, '-', ''),
  'delete',
  'core.api_keys',
  b."team_id",
  'core.api_key',
  b."id",
  'creator_not_team_member',
  jsonb_build_object(
    'name', b."name",
    'type', b."type",
    'userId', b."user_id",
    'teamId', b."team_id",
    'createdAt', b."created_at",
    'expiresAt', b."expires_at"
  ),
  jsonb_build_object('source', 'migration', 'migration', '20260929120000_remove_orphaned_api_keys')
FROM "tmp_api_keys_orphaned_backup" b;

DELETE FROM "api_keys"
WHERE "id" IN (SELECT "id" FROM "tmp_api_keys_orphaned_backup");
