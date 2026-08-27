import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getApps } from "@recommand/lib/app";
import { createT, type TranslationFunction } from "./translations";

// In-memory cache: language -> Map<key, translation>
const translationCache = new Map<string, Map<string, string>>();

// In-memory cache for the supported-language scan. Both caches are skipped in
// development so that adding a CSV takes effect without a restart.
let supportedLanguagesCache: string[] | null = null;

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
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && supportedLanguagesCache) {
    return supportedLanguagesCache;
  }

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

  const codes = Array.from(languageCodes);
  if (!isDev) {
    supportedLanguagesCache = codes;
  }
  return codes;
}

/**
 * Reduce a BCP 47 language tag to the bare lowercase code we key translations
 * by: "nl-BE" and "NL" both become "nl". We translate per language, not per
 * region, so a Belgian browser and a Dutch one get the same file.
 */
export function normalizeLanguage(language: string): string {
  return language.trim().split("-")[0].toLowerCase();
}

/**
 * Normalize a language tag and return it only if we ship translations for it,
 * otherwise null.
 *
 * Returns the canonical code rather than a boolean so callers store "nl" when
 * handed "nl-BE" — validating and normalizing separately is how an unnormalized
 * value ends up in the database. The supported set is derived from the CSV files
 * present on disk, so it can shrink between the moment a language was stored and
 * the moment it is used: check rather than trust a stored value.
 */
export async function toSupportedLanguage(
  language: string | null | undefined
): Promise<string | null> {
  if (!language) return null;
  const normalized = normalizeLanguage(language);
  return (await getSupportedLanguages()).includes(normalized) ? normalized : null;
}

/**
 * Narrow a language tag to one we can actually render, falling back to English.
 * For derived languages (a browser header, another record's language); use
 * toSupportedLanguage() and report the failure when the user picked explicitly.
 */
export async function resolveSupportedLanguage(
  language: string | null | undefined
): Promise<string> {
  return (await toSupportedLanguage(language)) ?? "en";
}
