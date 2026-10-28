import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { Hono } from 'hono';
import { setSignedCookie } from 'hono/cookie';
import { sessions, teamMembers, users } from '../db/schema';
import type { AuthenticatedUserContext } from '../lib/auth-middleware';

process.env.JWT_SECRET = 'test-only-session-signing-key-not-for-deployment';
let currentUser: { id: string; isAdmin: boolean; language: string } | null;
let member = true;
let keyExists = true;
// Sessions live in SQLite, so the session queries run as written.
const sqlite = new Database(':memory:');
sqlite.exec(
  'CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, auth_method TEXT, auth_time TEXT, expires_at TEXT, revoked_at TEXT, created_at TEXT, updated_at TEXT)',
);
const sessionsDb = drizzle(async (query, params) => ({
  rows: sqlite.prepare(query.replace(/\$\d+/g, '?')).values(...(params as string[])),
}));
let sessionCount = 0;
const db = {
  select: (fields: Parameters<typeof sessionsDb.select>[0]) => ({
    from: (table: unknown) =>
      table === sessions
        ? sessionsDb.select(fields).from(sessions)
        : {
            where: () => ({
              limit: async () =>
                table === users
                  ? currentUser
                    ? [currentUser]
                    : []
                  : table === teamMembers && member
                    ? [{ userId: 'user_test' }]
                    : [],
            }),
          },
  }),
  // SQLite rejects the `default` that drizzle writes for omitted columns.
  insert: () => ({
    values: (values: { userId: string; authMethod: string; authTime: Date; expiresAt: Date }) => ({
      returning: async () => {
        const id = `ses_${++sessionCount}`;
        sqlite
          .prepare('INSERT INTO sessions (id, user_id, auth_method, auth_time, expires_at) VALUES (?, ?, ?, ?, ?)')
          .run(id, values.userId, values.authMethod, values.authTime.toISOString(), values.expiresAt.toISOString());
        return [{ id }];
      },
    }),
  }),
  update: (table: unknown) =>
    table === sessions
      ? sessionsDb.update(sessions)
      : {
          set: (data: Partial<NonNullable<typeof currentUser>>) => ({
            where: async () => {
              if (currentUser) {
                Object.assign(currentUser, data);
              }
            },
          }),
        },
};
const key = {
  id: 'key_test',
  userId: 'user_test',
  teamId: 'team_test',
  type: 'jwt',
  expiresAt: new Date(Date.now() + 3600_000),
};
mock.module('@recommand/db', () => ({ db }));
mock.module('@core/data/api-keys', () => ({
  getApiKey: async () => (keyExists ? key : null),
  checkApiKey: async () => (keyExists && currentUser ? { user: currentUser, apiKey: key } : null),
}));
mock.module('@core/data/teams', () => ({
  getTeam: async (id: string) => ({ id }),
  isMember: async () => member,
}));
mock.module('@core/lib/audit', () => ({ audit: async () => {} }));
mock.module('@core/lib/translation-middleware', () => ({
  withTranslation: () => async (c: any, next: () => Promise<void>) => {
    c.set('t', (parts: TemplateStringsArray) => parts.join(''));
    await next();
  },
}));
mock.module('@core/lib/translations-server', () => ({
  toSupportedLanguage: async (value: string) => (['en', 'nl'].includes(value) ? value : null),
}));
const { createSession, deleteSession, verifySession } = await import('../lib/session');
const { sign } = await import('../lib/jwt');
const { requireAdmin, requireTeamAccess } = await import('../lib/auth-middleware');
const { default: account } = await import('../api/account');
const app = new Hono<AuthenticatedUserContext>();
app.get('/login', async (c) => {
  await createSession(c, { id: 'user_test', isAdmin: true }, 'password');
  return c.json({ ok: true });
});
app.get('/legacy-login', async (c) => {
  const expires = new Date(Date.now() + 3600_000);
  const token = await sign({ userId: 'user_test', isAdmin: false, language: 'en', expires }, expires);
  await setSignedCookie(c, 'session', token, process.env.JWT_SECRET!, { expires });
  return c.json({ ok: true });
});
app.post('/logout', async (c) => {
  await deleteSession(c);
  return c.json({ ok: true });
});
app.get('/admin', requireAdmin(), (c) => c.json({ ok: true }));
app.get('/:teamId/data', requireTeamAccess(), (c) => c.json({ ok: true }));
app.route('/', account);
app.get('/extension', async (c) => {
  await verifySession(c, [
    async () => ({
      userId: null,
      isAdmin: false,
      language: 'en',
      apiKey: null,
      teamId: 'team_test',
    }),
  ]);
  return c.json({ method: c.get('authenticationMethod') });
});
const basic = { Authorization: `Basic ${btoa('key_test:secret')}` };
async function bearer(subject = 'user_test') {
  return {
    Authorization: `Bearer ${await sign({ sub: subject, jti: key.id, teamId: key.teamId }, key.expiresAt)}`,
  };
}
async function cookie(path = '/login') {
  return (await app.request(path)).headers.get('set-cookie')!.split(';')[0];
}
function profile(headers: Record<string, string>) {
  return app.request('/account/profile', {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'nl' }),
  });
}
beforeEach(() => {
  currentUser = { id: 'user_test', isAdmin: false, language: 'en' };
  member = true;
  keyExists = true;
  sqlite.exec('DELETE FROM sessions');
});

describe('credential scope and current authorization', () => {
  for (const method of ['basic', 'bearer'] as const) {
    test(`${method}: removed member is denied even if a key survives`, async () => {
      const headers = method === 'basic' ? basic : await bearer();
      expect((await app.request('/team_test/data', { headers })).status).toBe(200);
      member = false;
      expect((await app.request('/team_test/data', { headers })).status).toBe(401);
    });
    test(`${method}: profile update does not mint a browser cookie`, async () => {
      const response = await profile(method === 'basic' ? basic : await bearer());
      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(currentUser!.language).toBe('nl');
    });
  }
  test('key remains bound to its team', async () => {
    expect((await app.request('/other_team/data', { headers: basic })).status).toBe(401);
  });
  test('JWT subject must match the key owner', async () => {
    expect(
      (await app.request('/team_test/data', { headers: await bearer('other_user') })).status,
    ).toBe(401);
  });
  test('deleted JWT keys are rejected', async () => {
    keyExists = false;
    expect((await app.request('/team_test/data', { headers: await bearer() })).status).toBe(401);
  });
  test('admin demotion takes effect for an already signed cookie', async () => {
    currentUser!.isAdmin = true;
    const headers = { Cookie: await cookie() };
    expect((await app.request('/admin', { headers })).status).toBe(200);
    currentUser!.isAdmin = false;
    expect((await app.request('/admin', { headers })).status).toBe(401);
    member = false;
    expect((await app.request('/other_team/data', { headers })).status).toBe(401);
  });
  test('deleted users cannot use existing cookies', async () => {
    const headers = { Cookie: await cookie() };
    currentUser = null;
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('browser profile updates still refresh their cookie', async () => {
    const response = await profile({ Cookie: await cookie() });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('session=');
  });
  test('current administrators retain intentional cross-team access', async () => {
    currentUser!.isAdmin = true;
    member = false;
    expect((await app.request('/other_team/data', { headers: basic })).status).toBe(200);
  });
  test('extension identities retain their distinct authentication method', async () => {
    expect(await (await app.request('/extension')).json()).toEqual({ method: 'extension' });
  });
});

describe('browser sessions', () => {
  test('signing out ends the session for every copy of its cookie', async () => {
    const headers = { Cookie: await cookie() };
    expect((await app.request('/team_test/data', { headers })).status).toBe(200);
    await app.request('/logout', { method: 'POST', headers });
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('a refreshed cookie stays part of the same session', async () => {
    const headers = { Cookie: await cookie() };
    const refreshed = (await profile(headers)).headers.get('set-cookie')!.split(';')[0];
    expect((await app.request('/team_test/data', { headers: { Cookie: refreshed } })).status).toBe(200);
    await app.request('/logout', { method: 'POST', headers: { Cookie: refreshed } });
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('a session past its expiry is refused', async () => {
    const headers = { Cookie: await cookie() };
    sqlite.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1_000).toISOString());
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('a session that is no longer stored is refused', async () => {
    const headers = { Cookie: await cookie() };
    sqlite.exec('DELETE FROM sessions');
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('a cookie signed before sessions were stored keeps working', async () => {
    const headers = { Cookie: await cookie('/legacy-login') };
    expect((await app.request('/team_test/data', { headers })).status).toBe(200);
  });
});
