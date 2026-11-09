import { oauthClients } from "@core/db/schema";
import type { ClientMetadata } from "@core/lib/oauth/client-metadata";
import { db } from "@recommand/db";

export type OAuthClient = typeof oauthClients.$inferSelect;

const toColumns = (metadata: ClientMetadata) => ({
  clientUri: metadata.client_uri ?? null,
  grantTypes: metadata.grant_types,
  logoUri: metadata.logo_uri ?? null,
  name: metadata.client_name ?? null,
  redirectUris: metadata.redirect_uris,
  tokenEndpointAuthMethod: metadata.token_endpoint_auth_method,
});

/**
 * Registers a client through dynamic client registration (RFC 7591).
 *
 * @see https://www.rfc-editor.org/rfc/rfc7591#section-3
 */
export const registerDynamicClient = async (metadata: ClientMetadata): Promise<OAuthClient> => {
  const [client] = await db
    .insert(oauthClients)
    .values({ ...toColumns(metadata), kind: "dynamic" })
    .returning();

  return client;
};
