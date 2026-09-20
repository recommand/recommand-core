import { expect, test } from 'bun:test';

// Bun module mocks are process-global. Keep these HTTP/data regression suites
// isolated so they cannot replace modules used by other package tests.
for (const path of ['./lib/session.test-case.ts', './data/team-members.test-case.ts']) {
  test(path, () => {
    const result = Bun.spawnSync([process.execPath, 'test', path], {
      cwd: import.meta.dir,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });
}
