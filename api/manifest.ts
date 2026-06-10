import { Server } from "@recommand/lib/api";
import { actionSuccess } from "@recommand/lib/utils";
import { getApps } from "@recommand/lib/app";

const server = new Server();

export type LegalDocument = {
  packageName: string;
  termsOfUse?: string;
  privacyPolicy?: string;
};

const _getManifest = server.get("/manifest", async (c) => {
  const apps = await getApps();
  const legal: LegalDocument[] = [];

  for (const app of apps) {
    if (app.termsOfUse || app.privacyPolicy) {
      legal.push({
        packageName: app.name,
        termsOfUse: app.termsOfUse,
        privacyPolicy: app.privacyPolicy,
      });
    }
  }

  return c.json(actionSuccess({ legal }));
});

export type Manifest = typeof _getManifest;

export default server;
