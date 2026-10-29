/**
 * The translation hook the registry's components call, for projects outside
 * the Recommand framework. It returns the English source text and the page's
 * language; replace it with an adapter to your own i18n library to translate
 * the few labels the components carry (mostly screen reader text).
 */

type TranslationFunction = {
  (strings: TemplateStringsArray, ...values: unknown[]): string;
  (text: string): string;
};

const t = ((text: string | TemplateStringsArray, ...values: unknown[]) =>
  typeof text === 'string'
    ? text
    : text.reduce(
        (result, part, index) =>
          result + part + (index < values.length ? String(values[index]) : ''),
        '',
      )) as TranslationFunction;

function pageLanguage(): string {
  const tag = typeof document === 'undefined' ? '' : document.documentElement.lang;
  const base = tag.split('-')[0]?.toLowerCase() ?? '';
  return /^[a-z]{2}$/.test(base) ? base : 'en';
}

export function useTranslation() {
  return { t, language: pageLanguage(), isLoaded: true };
}
