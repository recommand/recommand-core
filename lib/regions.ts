/**
 * Localized country-name lookup that tolerates bad data.
 *
 * Intl.DisplayNames.of() throws a RangeError for anything that isn't a
 * two-letter alpha or three-digit region subtag — it does not return undefined,
 * so a `?? code` fallback never fires. Country values that arrive through the
 * public API are unconstrained text, so an unexpected "BEL" or "Belgium" would
 * otherwise crash the whole table it's rendered in.
 */
export function regionDisplayName(
  regionNames: Intl.DisplayNames,
  code: string | null | undefined,
  fallback?: string
): string {
  if (!code) return fallback ?? "";
  try {
    return regionNames.of(code) ?? fallback ?? code;
  } catch {
    return fallback ?? code;
  }
}

/**
 * Build a region formatter for a language, falling back to English if the tag
 * is not one Intl accepts.
 */
export function createRegionNames(language: string): Intl.DisplayNames {
  try {
    return new Intl.DisplayNames([language], { type: "region" });
  } catch {
    return new Intl.DisplayNames(["en"], { type: "region" });
  }
}

export function sortByRegionDisplayName<T extends { code: string; name?: string }>(
  regions: readonly T[],
  regionNames: Intl.DisplayNames,
): T[] {
  const locale = regionNames.resolvedOptions().locale;

  return [...regions].sort((a, b) =>
    regionDisplayName(regionNames, a.code, a.name).localeCompare(
      regionDisplayName(regionNames, b.code, b.name),
      locale,
      { sensitivity: "base" },
    ),
  );
}
