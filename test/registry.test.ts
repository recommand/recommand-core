import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registryFiles } from '../scripts/build-registry';

const dir = join(import.meta.dir, '..', 'registry');

describe('component registry', () => {
  const files = registryFiles();

  test('registry/ matches the components (run bun run registry:build)', () => {
    for (const [name, content] of files) {
      expect(existsSync(join(dir, name))).toBe(true);
      expect(readFileSync(join(dir, name), 'utf-8')).toBe(content);
    }
    const stale = readdirSync(dir).filter((name) => name.endsWith('.json') && !files.has(name));
    expect(stale).toEqual([]);
  });

  test('every registry dependency is an item of the registry', () => {
    const names = new Set([...files.keys()].map((name) => `@recommand/${name.replace(/\.json$/, '')}`));
    for (const [name, content] of files) {
      if (name === 'registry.json') continue;
      for (const dependency of JSON.parse(content).registryDependencies ?? []) {
        expect(names.has(dependency)).toBe(true);
      }
    }
  });
});
