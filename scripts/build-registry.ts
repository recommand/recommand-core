/**
 * Builds a shadcn registry from core's components, so projects outside the
 * framework (a website, a documentation site) can install the same
 * components with `shadcn add`.
 *
 * Every file under components/ui becomes an item. Imports of core paths are
 * rewritten to shadcn's `@/` paths, which the shadcn CLI maps to the
 * consumer's aliases; imported core components, `lib/utils` and hooks become
 * registry dependencies in the `@recommand` namespace, and npm imports become
 * dependencies at the version core uses. The theme contract and its state
 * variants are a `theme` item, and `use-translation` is a stand-in for the
 * framework's translation hook.
 *
 *   bun run registry:build   writes registry/
 *   bun run registry:check   fails when registry/ is out of date
 *
 * registry/README.md says how to install from it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = join(import.meta.dir, '..');
const outDir = join(root, 'registry');
const NAMESPACE = '@recommand';

type FileType = 'registry:ui' | 'registry:lib' | 'registry:hook' | 'registry:file';

interface RegistryFile {
  path: string;
  type: FileType;
  target?: string;
  content: string;
}

interface RegistryItem {
  $schema: string;
  name: string;
  type: FileType | 'registry:theme';
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const versions: Record<string, string> = packageJson.dependencies;
// Provided by every React project; never listed as a dependency.
const PROVIDED = new Set(['react', 'react-dom']);

/** The npm package an import specifier belongs to. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Core paths a component may import, mapped to shadcn paths and registry items. */
function rewriteCoreImport(specifier: string): { path: string; item: string } {
  const ui = specifier.match(/^@core\/components\/ui\/([\w-]+)$/);
  if (ui) return { path: `@/components/ui/${ui[1]}`, item: ui[1] };
  if (specifier === '@core/lib/utils') return { path: '@/lib/utils', item: 'utils' };
  const hook = specifier.match(/^@core\/hooks\/([\w-]+)$/);
  if (hook) return { path: `@/hooks/${hook[1]}`, item: hook[1] };
  throw new Error(
    `Cannot publish an import of ${specifier}: it is not a component, utils or a hook`,
  );
}

/** Rewrites a source file's imports and collects what it depends on. */
function convert(source: string, file: string) {
  const dependencies = new Set<string>();
  const registryDependencies = new Set<string>();
  const content = source.replace(
    /(from\s+|import\s+)(['"])([^'"]+)\2/g,
    (statement, keyword: string, quote: string, specifier: string) => {
      if (specifier.startsWith('@core/')) {
        const { path, item } = rewriteCoreImport(specifier);
        registryDependencies.add(`${NAMESPACE}/${item}`);
        return `${keyword}${quote}${path}${quote}`;
      }
      if (specifier.startsWith('.')) {
        throw new Error(`${file}: use a core path instead of the relative import ${specifier}`);
      }
      const name = packageName(specifier);
      if (!PROVIDED.has(name)) {
        const version = versions[name];
        if (!version) throw new Error(`${file}: ${name} is not a dependency of core`);
        dependencies.add(`${name}@${version}`);
      }
      return statement;
    },
  );
  return { content, dependencies, registryDependencies };
}

function item(
  name: string,
  type: RegistryItem['type'],
  files: { source: string; path: string; type: FileType; target?: string }[],
  description?: string,
  extraDependencies: string[] = [],
): RegistryItem {
  const dependencies = new Set<string>(extraDependencies);
  const registryDependencies = new Set<string>();
  const converted = files.map(({ source, path, type, target }) => {
    const result = path.endsWith('.css')
      ? { content: source, dependencies: [], registryDependencies: [] }
      : convert(source, path);
    for (const dependency of result.dependencies) dependencies.add(dependency);
    for (const dependency of result.registryDependencies) registryDependencies.add(dependency);
    return { path, type, ...(target ? { target } : {}), content: result.content };
  });
  registryDependencies.delete(`${NAMESPACE}/${name}`);
  return {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name,
    type,
    ...(description ? { description } : {}),
    ...(dependencies.size ? { dependencies: [...dependencies].sort() } : {}),
    ...(registryDependencies.size
      ? { registryDependencies: [...registryDependencies].sort() }
      : {}),
    files: converted,
  };
}

const read = (path: string) => readFileSync(join(root, path), 'utf-8');

export function buildRegistry(): RegistryItem[] {
  const theme = item(
    'theme',
    'registry:theme',
    [
      {
        source: read('app/theme-default.css'),
        path: 'styles/theme-default.css',
        type: 'registry:file',
        target: 'styles/recommand-ui/theme-default.css',
      },
      {
        source: read('app/variants.css'),
        path: 'styles/variants.css',
        type: 'registry:file',
        target: 'styles/recommand-ui/variants.css',
      },
    ],
    'The theme contract with neutral defaults, and the state variants the components use. Import both after Tailwind and tw-animate-css, then your theme.',
    // The components animate with tw-animate-css classes.
    [`tw-animate-css@${versions['tw-animate-css']}`],
  );

  const items: RegistryItem[] = [
    theme,
    item('utils', 'registry:lib', [
      { source: read('lib/utils.ts'), path: 'lib/utils.ts', type: 'registry:lib' },
    ]),
    item('use-mobile', 'registry:hook', [
      { source: read('hooks/use-mobile.ts'), path: 'hooks/use-mobile.ts', type: 'registry:hook' },
    ]),
    item(
      'use-translation',
      'registry:hook',
      [
        {
          source: read('scripts/registry/use-translation.ts'),
          path: 'hooks/use-translation.ts',
          type: 'registry:hook',
        },
      ],
      'Returns the English text the components carry; replace it with an adapter to your i18n library.',
    ),
  ];

  const uiFiles = readdirSync(join(root, 'components/ui'))
    .filter((file) => file.endsWith('.tsx'))
    .sort();
  for (const file of uiFiles) {
    const name = basename(file, '.tsx');
    const registryItem = item(name, 'registry:ui', [
      { source: read(`components/ui/${file}`), path: `ui/${file}`, type: 'registry:ui' },
    ]);
    // Every component reads the theme contract.
    registryItem.registryDependencies = [
      ...new Set([...(registryItem.registryDependencies ?? []), `${NAMESPACE}/theme`]),
    ].sort();
    items.push(registryItem);
  }
  return items;
}

/** The files registry/ should contain, by name. */
export function registryFiles(): Map<string, string> {
  const items = buildRegistry();
  const files = new Map<string, string>();
  for (const registryItem of items) {
    files.set(`${registryItem.name}.json`, `${JSON.stringify(registryItem, null, 2)}\n`);
  }
  const index = {
    $schema: 'https://ui.shadcn.com/schema/registry.json',
    name: 'recommand',
    homepage: 'https://github.com/recommand/recommand-core',
    items: items.map(({ $schema, files: itemFiles, ...rest }) => ({
      ...rest,
      files: itemFiles.map(({ content, ...file }) => file),
    })),
  };
  files.set('registry.json', `${JSON.stringify(index, null, 2)}\n`);
  return files;
}

if (import.meta.main) {
  const files = registryFiles();
  const existing = existsSync(outDir)
    ? readdirSync(outDir).filter((file) => file.endsWith('.json'))
    : [];

  if (process.argv.includes('--check')) {
    const stale = [
      ...[...files]
        .filter(([name, content]) => {
          const path = join(outDir, name);
          return !existsSync(path) || readFileSync(path, 'utf-8') !== content;
        })
        .map(([name]) => name),
      ...existing.filter((name) => !files.has(name)),
    ];
    if (stale.length) {
      console.error(`registry/ is out of date (${stale.join(', ')}). Run bun run registry:build.`);
      process.exit(1);
    }
    console.log(`registry/ is up to date (${files.size - 1} items).`);
  } else {
    mkdirSync(outDir, { recursive: true });
    for (const name of existing) if (!files.has(name)) rmSync(join(outDir, name));
    for (const [name, content] of files) writeFileSync(join(outDir, name), content);
    console.log(`Wrote ${files.size - 1} items to registry/.`);
  }
}
