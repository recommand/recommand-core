import { beforeEach, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/pg-proxy';
const sqlite = new Database(':memory:');
for (const table of ['team_members', 'api_keys', 'user_permissions']) {
  sqlite.exec(`CREATE TABLE ${table} (team_id TEXT, user_id TEXT)`);
}
let failDeletion = false;
const db = drizzle(async (query, params) => {
  if (failDeletion && query.includes('delete from "team_members"'))
    throw new Error('injected failure');
  const values: string[] = [];
  const statement = query.replace(/\$(\d+)/g, (_, index) => {
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
  for (const table of ['team_members', 'api_keys', 'user_permissions']) {
    sqlite.exec(`DELETE FROM ${table}`);
    for (const [team, user] of [
      ['one', 'alice'],
      ['two', 'alice'],
      ['one', 'bob'],
    ]) {
      sqlite.prepare(`INSERT INTO ${table} VALUES (?, ?)`).run(team!, user!);
    }
  }
});
test("removal deletes only the member's keys and grants in the selected team", async () => {
  await removeTeamMember('one', 'alice');
  for (const table of ['team_members', 'api_keys', 'user_permissions']) {
    expect(
      sqlite.prepare(`SELECT team_id, user_id FROM ${table} ORDER BY team_id, user_id`).values(),
    ).toEqual([
      ['one', 'bob'],
      ['two', 'alice'],
    ]);
  }
  expect(emitted).toHaveBeenCalledTimes(1);
});
test('failed removal rolls back credential deletion and does not emit success', async () => {
  failDeletion = true;
  await expect(removeTeamMember('one', 'alice')).rejects.toThrow();
  for (const table of ['team_members', 'api_keys', 'user_permissions']) {
    expect(sqlite.prepare(`SELECT COUNT(*) FROM ${table}`).values()[0]).toEqual([3]);
  }
  expect(emitted).not.toHaveBeenCalled();
});
