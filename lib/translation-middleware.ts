import { createMiddleware } from "hono/factory";
import { loadTranslations } from "./translations-server";
import { createT, type TranslationFunction } from "./translations";

type TranslationContext = {
  Variables: {
    t: TranslationFunction;
    language: string;
  };
};

/**
 * Parse the Accept-Language header and return the preferred language code.
 * e.g. "nl,en-US;q=0.9,fr;q=0.7" -> "nl"
 */
function parseAcceptLanguage(header: string): string {
  const languages = header.split(",").map((part) => {
    const [tag, ...rest] = part.trim().split(";");
    const q = rest.find((r) => r.trim().startsWith("q="));
    return {
      code: tag.trim().split("-")[0].toLowerCase(),
      quality: q ? parseFloat(q.trim().slice(2)) : 1,
    };
  });
  languages.sort((a, b) => b.quality - a.quality);
  return languages[0]?.code ?? "en";
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
      const acceptLanguage = c.req.header("Accept-Language");
      language = acceptLanguage ? parseAcceptLanguage(acceptLanguage) : "en";
    }
    c.set("language", language);
    const translations = await loadTranslations(language);
    c.set("t", createT(translations));
    await next();
  });
}
