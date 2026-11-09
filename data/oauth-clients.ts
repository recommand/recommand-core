import { oauthClients } from "@core/db/schema";
import type { ClientMetadata, ClientMetadataDocument, Fetch } from "@core/lib/oauth/client-metadata";
import {
  ClientMetadataUnavailableError,
  fetchClientMetadataDocument,
  parseClientIdUrl,
} from "@core/lib/oauth/client-metadata";
import type { Lookup } from "@core/lib/oauth/network";
import { db } from "@recommand/db";
import { eq } from "drizzle-orm";

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

/**
 * The client a `client_id` names, or `null` when there is none or it is
 * disabled. A URL names a Client ID Metadata Document, which is fetched, and
 * fetched again once the stored copy is as old as the document allowed. While
 * its host can't be reached, a stored copy is used; otherwise a document that
 * can't be read throws a `ClientMetadataError`.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-6
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-6.2
 */
export const findClient = async (
  clientId: string,
  options: { fetch?: Fetch; lookup?: Lookup } = {}
): Promise<OAuthClient | null> => {
  const [stored] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  if (stored?.disabledAt) {
    return null;
  }

  if (!parseClientIdUrl(clientId)) {
    return stored ?? null;
  }

  if (stored?.metadataFetchedAt && stored.metadataMaxAge !== null && Date.now() - stored.metadataFetchedAt.getTime() < stored.metadataMaxAge * 1_000) {
    return stored;
  }

  let fetched: ClientMetadataDocument;
  try {
    fetched = await fetchClientMetadataDocument(clientId, options);
  } catch (error) {
    // A host that is down for a while doesn't lock out a client's users; the
    // stored copy is used, and checked again once it's as old as before
    if (stored && error instanceof ClientMetadataUnavailableError) {
      const [checked] = await db
        .update(oauthClients)
        .set({ metadataFetchedAt: new Date() })
        .where(eq(oauthClients.id, clientId))
        .returning();

      return checked;
    }

    throw error;
  }
  const columns = { ...toColumns(fetched.metadata), metadataFetchedAt: new Date(), metadataMaxAge: fetched.maxAgeSeconds };
  const [client] = await db
    .insert(oauthClients)
    .values({ ...columns, id: clientId, kind: "dynamic" })
    .onConflictDoUpdate({ set: columns, target: oauthClients.id })
    .returning();

  return client;
};

