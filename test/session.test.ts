import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { setSignedCookie } from 'hono/cookie';
import { sessions, teamMembers, users } from '../db/schema';
import type { AuthenticatedUserContext } from '../lib/auth-middleware';

process.env.JWT_SECRET = 'test-only-session-signing-key-not-for-deployment';
let currentUser: { id: string; isAdmin: boolean; language: string } | null;
let member = true;
let keyExists = true;
type StoredSession = { id: string; userId: string; expiresAt: Date; revokedAt: Date | null };
let storedSessions: StoredSession[];
const dialect = new PgDialect();
// Every session query filters on the session ID, its first parameter.
const sessionsMatching = (condition: SQL) =>
  storedSessions.filter((session) => session.id === dialect.sqlToQuery(condition).params[0]);
const key = {
  id: 'key_test',
  userId: 'user_test',
  teamId: 'team_test',
  type: 'jwt',
  expiresAt: new Date(Date.now() + 3600_000),
};
mock.module('@recommand/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => ({
          limit: async () =>
            table === sessions
              ? sessionsMatching(condition)
              : table === users
                ? currentUser
                  ? [currentUser]
                  : []
                : table === teamMembers && member
                  ? [{ userId: 'user_test' }]
                  : [],
        }),
      }),
    }),
    insert: () => ({
      values: (values: Omit<StoredSession, 'id' | 'revokedAt'>) => ({
        returning: async () => {
          const session = { ...values, id: `ses_${storedSessions.length + 1}`, revokedAt: null };
          storedSessions.push(session);
          return [{ id: session.id }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (data: { language?: string; revokedAt?: Date }) => ({
        where: async (condition: SQL) => {
          if (table === sessions) {
            for (const session of sessionsMatching(condition)) {
              session.revokedAt ??= data.revokedAt ?? null;
            }
          } else if (currentUser) {
            currentUser.language = data.language!;
          }
        },
      }),
    }),
  },
}));
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
  storedSessions = [];
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
    storedSessions[0].expiresAt = new Date(Date.now() - 1_000);
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('a session that is no longer stored is refused', async () => {
    const headers = { Cookie: await cookie() };
    storedSessions = [];
    expect((await app.request('/team_test/data', { headers })).status).toBe(401);
  });
  test('a cookie signed before sessions were stored keeps working', async () => {
    const headers = { Cookie: await cookie('/legacy-login') };
    expect((await app.request('/team_test/data', { headers })).status).toBe(200);
  });
});
