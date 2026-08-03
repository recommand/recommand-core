/**
 * Localized language-name lookup that tolerates bad data.
 *
 * Intl.DisplayNames.of() throws a RangeError for invalid language tags, so a
 * simple `?? code` fallback never fires without a try/catch.
 */
function languageDisplayName(
  languageNames: Intl.DisplayNames,
  code: string | null | undefined,
  fallback?: string
): string {
  if (!code) return fallback ?? "";
  try {
    const name = languageNames.of(code);
    if (!name) return fallback ?? code;
    return capitalizeDisplayName(name, languageNames.resolvedOptions().locale);
  } catch {
    return fallback ?? code;
  }
}

/**
 * Build a language formatter for a locale, falling back to English if the tag
 * is not one Intl accepts.
 */
function createLanguageNames(language: string): Intl.DisplayNames {
  try {
    return new Intl.DisplayNames([language], { type: "language" });
  } catch {
    return new Intl.DisplayNames(["en"], { type: "language" });
  }
}

/**
 * Label a language as "Native - Localized", e.g. "Nederlands - Dutch".
 * When both names match, only the native name is shown.
 */
export function languageOptionLabel(
  code: string,
  uiLanguage: string,
  fallbackNative?: string
): string {
  const native = languageDisplayName(
    createLanguageNames(code),
    code,
    fallbackNative
  );
  const localized = languageDisplayName(
    createLanguageNames(uiLanguage),
    code,
    fallbackNative
  );

  if (
    native.localeCompare(localized, uiLanguage, { sensitivity: "base" }) === 0
  ) {
    return native;
  }

  return `${native} - ${localized}`;
}

export function sortByLanguageOptionLabel<T extends { code: string; name?: string }>(
  languages: readonly T[],
  uiLanguage: string,
): T[] {
  return [...languages].sort((a, b) =>
    languageOptionLabel(a.code, uiLanguage, a.name).localeCompare(
      languageOptionLabel(b.code, uiLanguage, b.name),
      uiLanguage,
      { sensitivity: "base" },
    ),
  );
}

function capitalizeDisplayName(name: string, locale: string): string {
  const first = [...name][0];
  if (!first) return name;
  return first.toLocaleUpperCase(locale) + name.slice(first.length);
}
