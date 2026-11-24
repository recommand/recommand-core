import { beforeEach, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/pg-proxy';
const sqlite = new Database(':memory:');
['team_members', 'user_permissions'].forEach((table) => {
  sqlite.exec(`CREATE TABLE ${table} (team_id TEXT, user_id TEXT)`);
});
sqlite.exec('CREATE TABLE api_keys (id TEXT, team_id TEXT, user_id TEXT)');
sqlite.exec('CREATE TABLE principal_permissions (principal_type TEXT, principal_id TEXT, team_id TEXT, permission_id TEXT)');
// Removing a member also removes the team from their OAuth grants
sqlite.exec('CREATE TABLE oauth_grants (id TEXT, user_id TEXT)');
const members = [
  ['one', 'alice'],
  ['two', 'alice'],
  ['one', 'bob'],
] as const;
let failDeletion = false;
const db = drizzle(async (query, params) => {
  if (failDeletion && query.includes('delete from "team_members"'))
    throw new Error('injected failure');
  const values: string[] = [];
  // SQLite has no row locks
  const statement = query.replace(/ for (update|share)$/, '').replace(/\$(\d+)/g, (_, index) => {
    values.push(params[Number(index) - 1]);
    return '?';
  });
  return { rows: sqlite.prepare(statement).values(...values) };
});
mock.module('@recommand/db', () => ({
  db: {
    delete: db.delete.bind(db),
    transaction: async (run: (tx: typeof db) => Promise<unknown>) => {
      sqlite.exec('BEGIN');
      try {
        const result = await run(db);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  },
}));
const emitted = mock(async () => {});
mock.module('@core/lib/backend-events', () => ({
  CORE_BACKEND_EVENTS: { TEAM_MEMBER_REMOVED: 'team.member.removed' },
  emitBackendEvent: emitted,
}));
const { removeTeamMember } = await import('../data/team-members');
beforeEach(() => {
  emitted.mockClear();
  failDeletion = false;
  ['team_members', 'user_permissions'].forEach((table) => {
    sqlite.exec(`DELETE FROM ${table}`);
    members.forEach(([team, user]) => {
      sqlite.prepare(`INSERT INTO ${table} VALUES (?, ?)`).run(team, user);
    });
  });
  sqlite.exec('DELETE FROM api_keys; DELETE FROM principal_permissions');
  members.forEach(([team, user]) => {
    sqlite.prepare('INSERT INTO api_keys VALUES (?, ?, ?)').run(`key_${team}_${user}`, team, user);
    sqlite.prepare("INSERT INTO principal_permissions VALUES ('api_key', ?, ?, 'test.read')").run(`key_${team}_${user}`, team);
  });
});
test("removal deletes only the member's keys, their grants and permissions in the selected team", async () => {
  await removeTeamMember('one', 'alice');
  ['team_members', 'api_keys', 'user_permissions'].forEach((table) => {
    expect(
      sqlite.prepare(`SELECT team_id, user_id FROM ${table} ORDER BY team_id, user_id`).values(),
    ).toEqual([
      ['one', 'bob'],
      ['two', 'alice'],
    ]);
  });
  expect(sqlite.prepare('SELECT principal_id FROM principal_permissions ORDER BY principal_id').values()).toEqual([
    ['key_one_bob'],
    ['key_two_alice'],
  ]);
  expect(emitted).toHaveBeenCalledTimes(1);
});
test('failed removal rolls back credential deletion and does not emit success', async () => {
  failDeletion = true;
  await expect(removeTeamMember('one', 'alice')).rejects.toThrow();
  ['team_members', 'api_keys', 'user_permissions', 'principal_permissions'].forEach((table) => {
    expect(sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).values()[0]).toEqual([3]);
  });
  expect(emitted).not.toHaveBeenCalled();
});
