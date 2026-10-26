import { Server } from "@recommand/lib/api";
import { describeRoute } from "hono-openapi";
import { actionSuccess } from "@recommand/lib/utils";
import { loadTranslations } from "@core/lib/translations-server";

const server = new Server();

const _getTranslations = server.get("/translations/:lang", describeRoute({ hide: true, security: [] }), async (c) => {
  const lang = c.req.param("lang");

  const translations = await loadTranslations(lang);
  return c.json(
    actionSuccess({ translations: Object.fromEntries(translations) })
  );
});

export type Translations = typeof _getTranslations;

export default server;
