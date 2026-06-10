export type TranslationFunction = (strings: TemplateStringsArray, ...values: unknown[]) => string;

/**
 * Derive a translation key from a tagged template literal's static parts.
 * e.g. t`Hi ${name}, welcome` -> "Hi {0}, welcome"
 */
function deriveKey(strings: TemplateStringsArray): string {
  return strings.reduce((result, str, i) => {
    return result + (i > 0 ? `{${i - 1}}` : "") + str;
  }, "");
}

/**
 * Replace {0}, {1}, etc. placeholders with actual values.
 */
function interpolate(template: string, values: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index) => {
    const i = parseInt(index, 10);
    return i < values.length ? String(values[i]) : `{${index}}`;
  });
}

/**
 * Concatenate a tagged template literal's parts with its values (default behavior).
 */
function concatenate(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce((result, str, i) => {
    return result + (i > 0 ? String(values[i - 1]) : "") + str;
  }, "");
}

/**
 * Create a tagged template translation function for a specific language.
 *
 * Usage:
 *   const t = createT(translations);
 *   t`Hi ${name}, welcome to our platform.`
 *
 * If no translation is found, returns the original English string.
 */
export function createT(
  translations: Map<string, string>
): TranslationFunction {
  return (strings: TemplateStringsArray, ...values: unknown[]): string => {
    if (translations.size === 0) {
      return concatenate(strings, values);
    }

    const key = deriveKey(strings);
    const translation = translations.get(key);

    if (!translation) {
      return concatenate(strings, values);
    }

    return interpolate(translation, values);
  };
}

/**
 * A no-op translation function that returns the original English string.
 * Use this as a default/fallback when no translation context is available.
 */
export const fallbackT: TranslationFunction = createT(new Map());
