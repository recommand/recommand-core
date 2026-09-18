import { Server } from "@recommand/lib/api";
import { actionSuccess } from "@recommand/lib/utils";
import { getApps } from "@recommand/lib/app";
import { isPublicSignupEnabled } from "@core/lib/signup";

const server = new Server();

export type LegalDocument = {
  packageName: string;
  termsOfUse?: string;
  privacyPolicy?: string;
};

export type ManifestData = {
  legal: LegalDocument[];
  /** False when DISABLE_PUBLIC_SIGNUP is set; users can then only join via invitation. */
  publicSignupEnabled: boolean;
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

  const manifest: ManifestData = { legal, publicSignupEnabled: isPublicSignupEnabled() };
  return c.json(actionSuccess(manifest));
});

export type Manifest = typeof _getManifest;

export default server;
