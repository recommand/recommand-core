import { useEffect } from "react";
import { useTranslationStore } from "@core/lib/translation-store";
import { useUser } from "@core/hooks/user";

const DEFAULT_LANGUAGE = "en";

/**
 * Reduce a language tag to a bare two-letter code, falling back to English.
 *
 * The stored user language is only validated as a short string server-side, and
 * navigator.language can be absent or empty, so anything reaching Intl.* must be
 * normalised first — Intl throws a RangeError on a structurally invalid tag.
 */
function normalizeLanguage(value: string | null | undefined): string {
  const base = value?.split("-")[0]?.toLowerCase() ?? "";
  return /^[a-z]{2}$/.test(base) ? base : DEFAULT_LANGUAGE;
}

function getBrowserLanguage(): string {
  return normalizeLanguage(
    typeof navigator === "undefined" ? undefined : navigator.language
  );
}

export function useTranslation() {
  const user = useUser();
  const { t, language, isLoaded, loadTranslations } = useTranslationStore();

  const userLanguage = user?.language
    ? normalizeLanguage(user.language)
    : getBrowserLanguage();

  useEffect(() => {
    if (userLanguage !== language || !isLoaded) {
      loadTranslations(userLanguage);
    }
  }, [userLanguage, language, isLoaded, loadTranslations]);

  return { t, language: userLanguage, isLoaded };
}
