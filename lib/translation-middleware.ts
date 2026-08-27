import { createMiddleware } from "hono/factory";
import {
  getSupportedLanguages,
  loadTranslations,
  normalizeLanguage,
} from "./translations-server";
import { createT, type TranslationFunction } from "./translations";

type TranslationContext = {
  Variables: {
    t: TranslationFunction;
    language: string;
  };
};

/**
 * Parse an Accept-Language header into normalized language codes, most
 * preferred first. e.g. "nl-BE,en-US;q=0.9,fr;q=0.7" -> ["nl", "en", "fr"]
 *
 * Region subtags are dropped because we translate per language, not per region.
 */
function parseAcceptLanguage(header: string): string[] {
  const languages = header
    .split(",")
    .map((part) => {
      const [tag, ...rest] = part.trim().split(";");
      const q = rest.find((r) => r.trim().startsWith("q="));
      const quality = q ? parseFloat(q.trim().slice(2)) : 1;
      return {
        code: normalizeLanguage(tag),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.code && entry.code !== "*" && entry.quality > 0);

  // Sort is stable in every runtime we target, so equal-quality tags keep the
  // order the browser listed them in.
  languages.sort((a, b) => b.quality - a.quality);

  return [...new Set(languages.map((entry) => entry.code))];
}

/**
 * The best language from an Accept-Language header that we ship translations
 * for. A browser asking for "es,nl;q=0.9" gets Dutch rather than falling all
 * the way through to English just because its first choice is unavailable.
 */
async function pickLanguage(header: string | undefined): Promise<string> {
  if (!header) return "en";
  const supported = await getSupportedLanguages();
  return parseAcceptLanguage(header).find((code) => supported.includes(code)) ?? "en";
}

/**
 * Middleware that creates a translation function.
 *
 * For authenticated routes (used after requireAuth()), it reads the user's
 * language from the session via c.get("language").
 *
 * For unauthenticated routes, it falls back to the browser's Accept-Language header.
 *
 * Usage:
 *   server.get("/route", requireAuth(), withTranslation(), async (c) => {
 *     const t = c.get("t");
 *     return c.json(actionSuccess({ message: t`Hello` }));
 *   });
 */
export function withTranslation() {
  return createMiddleware<TranslationContext>(async (c, next) => {
    let language = c.get("language");
    if (!language) {
      language = await pickLanguage(c.req.header("Accept-Language"));
    }
    c.set("language", language);
    const translations = await loadTranslations(language);
    c.set("t", createT(translations));
    await next();
  });
}
