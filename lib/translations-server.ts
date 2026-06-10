import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getApps } from "@recommand/lib/app";
import { createT, type TranslationFunction } from "./translations";

// In-memory cache: language -> Map<key, translation>
const translationCache = new Map<string, Map<string, string>>();

/**
 * Parse a two-column CSV string into a Map of key -> translation.
 * Each line: english key,translated value
 * Commas within values are escaped as \,
 */
export function parseCSV(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Split on the first unescaped comma
    const separatorIndex = findUnescapedComma(trimmed);
    if (separatorIndex === -1) continue;

    const key = unescape(trimmed.slice(0, separatorIndex));
    const value = unescape(trimmed.slice(separatorIndex + 1));
    if (key && value) {
      result.set(key, value);
    }
  }

  return result;
}

function findUnescapedComma(str: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\" && i + 1 < str.length) {
      i++; // skip escaped character
      continue;
    }
    if (str[i] === ",") return i;
  }
  return -1;
}

function unescape(str: string): string {
  return str.replace(/\\,/g, ",").replace(/\\\\/g, "\\");
}

/**
 * Load and merge translations for a language from all packages.
 * Results are cached in memory (skipped in development).
 */
export async function loadTranslations(
  language: string
): Promise<Map<string, string>> {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev) {
    const cached = translationCache.get(language);
    if (cached) return cached;
  }

  const apps = await getApps();
  const merged = new Map<string, string>();

  for (const app of apps) {
    try {
      const csvPath = join(app.absolutePath, "translations", `${language}.csv`);
      const content = readFileSync(csvPath, "utf-8");
      const translations = parseCSV(content);
      for (const [key, value] of translations) {
        merged.set(key, value);
      }
    } catch {
      // No translation file for this package/language — skip
    }
  }

  if (!isDev) {
    translationCache.set(language, merged);
  }

  return merged;
}

/**
 * Create a translation function with pre-loaded translations.
 * Use this in server-side code (API routes, email sending, etc.).
 */
export async function createServerT(
  language: string
): Promise<TranslationFunction> {
  const translations = await loadTranslations(language);
  return createT(translations);
}

/**
 * Get all supported language codes by scanning translation CSV files
 * across all packages.
 */
export async function getSupportedLanguages(): Promise<string[]> {
  const apps = await getApps();
  const languageCodes = new Set<string>(["en"]);

  for (const app of apps) {

    // Skip framework and core packages, as we want the supported languages to be defined by other packages
    if (app.name === "framework" || app.name === "core") {
      continue;
    }
    
    try {
      const translationsDir = join(app.absolutePath, "translations");
      const files = readdirSync(translationsDir);
      for (const file of files) {
        if (file.endsWith(".csv")) {
          languageCodes.add(file.replace(".csv", ""));
        }
      }
    } catch {
      // No translations directory for this package
    }
  }

  return Array.from(languageCodes);
}
