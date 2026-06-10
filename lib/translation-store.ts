import { create } from "zustand";
import { createT, fallbackT, type TranslationFunction } from "./translations";

// Track in-flight request to prevent concurrent fetches
let loadingPromise: Promise<void> | null = null;
let loadingLanguage: string | null = null;

const CACHE_KEY = "recommand_translations_cache";

function getCachedTranslations(language: string): Map<string, string> | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${language}`);
    if (!raw) return null;
    return new Map<string, string>(JSON.parse(raw));
  } catch {
    return null;
  }
}

function setCachedTranslations(
  language: string,
  translations: Map<string, string>
) {
  try {
    localStorage.setItem(
      `${CACHE_KEY}_${language}`,
      JSON.stringify(Array.from(translations.entries()))
    );
  } catch {}
}

interface TranslationState {
  language: string;
  translations: Map<string, string>;
  isLoaded: boolean;
  t: TranslationFunction;
  loadTranslations: (language: string) => Promise<void>;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  language: "en",
  translations: new Map(),
  isLoaded: false,
  t: fallbackT,

  loadTranslations: async (language: string) => {
    // Skip if already loaded for this language
    if (get().language === language && get().isLoaded) return;

    // If a fetch for this language is already in flight, reuse it
    if (loadingLanguage === language && loadingPromise) {
      return loadingPromise;
    }

    // Hydrate from localStorage cache immediately
    const cached = getCachedTranslations(language);
    if (cached && cached.size > 0) {
      set({
        language,
        translations: cached,
        isLoaded: true,
        t: createT(cached),
      });
    } else {
      set({ language });
    }

    const promise = (async () => {
      try {
        const response = await fetch(`/api/core/translations/${language}`);
        const data = await response.json();

        if (data.success && data.translations) {
          const map = new Map<string, string>(
            Object.entries(data.translations)
          );
          set({
            translations: map,
            isLoaded: true,
            t: createT(map),
          });
          setCachedTranslations(language, map);
        }
      } catch (error) {
        console.error("Failed to load translations:", error);
        if (!get().isLoaded) {
          set({
            translations: new Map(),
            isLoaded: true,
            t: fallbackT,
          });
        }
      } finally {
        loadingPromise = null;
        loadingLanguage = null;
      }
    })();

    loadingLanguage = language;
    loadingPromise = promise;
    return promise;
  },
}));
