import { Server } from "@recommand/lib/api";
import { actionSuccess, actionFailure } from "@recommand/lib/utils";
import { getSupportedLanguages } from "@core/lib/translations-server";

const server = new Server();

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  nl: "Nederlands",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  da: "Dansk",
  sv: "Svenska",
  nb: "Norsk bokmål",
  fi: "Suomi",
  pl: "Polski",
  cs: "Čeština",
  ro: "Română",
  hu: "Magyar",
  tr: "Türkçe",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
  ar: "العربية",
  ru: "Русский",
  uk: "Українська",
};

const _getLanguages = server.get("/languages", async (c) => {
  try {
    const codes = await getSupportedLanguages();

    const languages = codes
      .map((code) => ({
        code,
        name: LANGUAGE_NAMES[code] ?? code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json(actionSuccess({ languages }));
  } catch (e) {
    console.error(e);
    return c.json(actionFailure("Internal server error"), 500);
  }
});

export type Languages = typeof _getLanguages;

export default server;
