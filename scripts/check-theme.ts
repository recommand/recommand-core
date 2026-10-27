/**
 * Fails when a component uses a token outside the theme contract
 * (app/theme-default.css, described in THEMING.md) or a raw colour.
 *
 * Usage: bun run check:theme [--list]
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

const root = join(import.meta.dir, '..');
const contractCss = readFileSync(join(root, 'app/theme-default.css'), 'utf-8');

const declared = (prefix: string) =>
  new Set(
    [...contractCss.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, 'g'))].map(
      (m) => m[1],
    ),
  );

const contract = {
  colors: declared('color'),
  spacing: declared('spacing'),
  text: declared('text'),
  fontWeight: declared('font-weight'),
};

const COLOR_KEYWORDS = new Set(['transparent', 'current', 'inherit']);
const TAILWIND_HUES =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-\d{2,3})?$/;
const RAW_COLOR = /#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(/i;

// Values that are not colours for prefixes that also take colours.
const NOT_COLOR: Record<string, RegExp> = {
  text: /^(xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/,
  border:
    /^(\d+|x|y|t|b|l|r|s|e|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing.*)$/,
  ring: /^(\d+|inset|offset.*)$/,
  outline: /^(\d+|none|hidden|dashed|dotted|double|offset.*)$/,
  bg: /^(fixed|local|scroll|clip-.*|origin-.*|repeat.*|no-repeat|cover|contain|auto|center|top|bottom|left|right|none|linear.*|radial.*|conic.*|gradient.*|blend.*)$/,
  fill: /^none$/,
  stroke: /^\d+$/,
  decoration: /^(\d+|auto|from-font|solid|double|dotted|dashed|wavy|clone|slice)$/,
  divide: /^(\d+|x|y|x-.*|y-.*|solid|dashed|dotted|double|none)$/,
  shadow: /^(2xs|xs|sm|md|lg|xl|2xl|none|inner)$/,
  from: /^\d+%$/,
  via: /^\d+%$/,
  to: /^\d+%$/,
  placeholder: /^$/,
  caret: /^$/,
  accent: /^(auto)$/,
};
const SIZE_KEYWORDS =
  /^(\d+(\.\d+)?|px|full|screen|svh|lvh|dvh|svw|lvw|dvw|auto|fit|min|max|prose|none|[2-9]?xs|sm|md|lg|[2-7]?xl|\d+\/\d+|lh)$/;
const FONT_KEYWORDS =
  /^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono|stretch-.*)$/;

const UTILITY =
  /(?<![\w-])(?:[a-z0-9@*-]+:)*!?(bg|text|border(?:-[xytblrse])?|ring(?:-offset)?|fill|stroke|outline|from|via|to|divide|placeholder|decoration|shadow|caret|accent|h|w|size|min-h|min-w|max-h|max-w|font)-(\[[^\]\s]+\]|[a-z0-9.%/_-]+)/g;

type Finding = { file: string; line: number; utility: string; reason: string };
const findings: Finding[] = [];

function check(prefix: string, rawValue: string): string | undefined {
  if (rawValue.startsWith('[')) {
    return RAW_COLOR.test(rawValue) ? 'raw colour' : undefined;
  }
  const value = rawValue.replace(/\/\d+$/, '');
  const base = prefix.replace(/-(?:[xytblrse]|offset)$/, '');

  if (['h', 'w', 'size', 'min-h', 'min-w', 'max-h', 'max-w'].includes(base)) {
    if (SIZE_KEYWORDS.test(value) || contract.spacing.has(value)) return undefined;
    return 'size outside the contract';
  }
  if (base === 'font') {
    if (FONT_KEYWORDS.test(value) || contract.fontWeight.has(value)) return undefined;
    return 'font token outside the contract';
  }
  if (base === 'text' && contract.text.has(value)) return undefined;
  if (NOT_COLOR[base]?.test(value)) return undefined;
  if (contract.colors.has(value) || COLOR_KEYWORDS.has(value)) return undefined;
  if (TAILWIND_HUES.test(value)) return 'raw Tailwind colour';
  return `${base === 'text' ? 'colour or type' : 'colour'} outside the contract`;
}

for (const path of new Glob('components/**/*.tsx').scanSync({ cwd: root })) {
  const source = readFileSync(join(root, path), 'utf-8');
  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(UTILITY)) {
      const [utility, prefix, value] = match;
      const reason = check(prefix, value);
      if (reason)
        findings.push({ file: relative(root, join(root, path)), line: index + 1, utility, reason });
    }
  });
}

if (findings.length === 0) {
  console.log('Theme contract: every component token is in the contract.');
  process.exit(0);
}

const byFile = Map.groupBy(findings, (f) => f.file);
if (process.argv.includes('--list')) {
  for (const [file, items] of byFile) {
    for (const f of items) console.log(`${file}:${f.line}  ${f.utility}  (${f.reason})`);
  }
}
console.error(
  `Theme contract: ${findings.length} token(s) outside the contract in ${byFile.size} file(s).`,
);
process.exit(1);
