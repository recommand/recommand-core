import { useEffect } from "react";
import { useTranslationStore } from "@core/lib/translation-store";
import { useUser } from "@core/hooks/user";

function getBrowserLanguage(): string {
  return navigator.language?.split("-")[0] ?? "en";
}

export function useTranslation() {
  const user = useUser();
  const { t, language, isLoaded, loadTranslations } = useTranslationStore();

  const userLanguage = user?.language ?? getBrowserLanguage();

  useEffect(() => {
    if (userLanguage !== language || !isLoaded) {
      loadTranslations(userLanguage);
    }
  }, [userLanguage, language, isLoaded, loadTranslations]);

  return { t, language: userLanguage, isLoaded };
}
