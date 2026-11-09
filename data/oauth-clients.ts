import { oauthClients } from "@core/db/schema";
import {
  ClientMetadataError,
  ClientMetadataUnavailableError,
  fetchClientMetadataDocument,
  parseClientIdUrl,
  type ClientMetadata,
  type Fetch,
} from "@core/lib/oauth/client-metadata";
import type { Lookup } from "@core/lib/oauth/network";
import { db } from "@recommand/db";
import { eq } from "drizzle-orm";

export type OAuthClient = typeof oauthClients.$inferSelect;

const METADATA_MAX_AGE = 60 * 60 * 1_000;

const toColumns = (metadata: ClientMetadata) => ({
  clientUri: metadata.client_uri ?? null,
  grantTypes: metadata.grant_types,
  logoUri: metadata.logo_uri ?? null,
  name: metadata.client_name ?? null,
  redirectUris: metadata.redirect_uris,
  tokenEndpointAuthMethod: metadata.token_endpoint_auth_method,
});

/** Registers a client through dynamic client registration (RFC 7591). */
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
 * fetched again once the stored copy is an hour old. While its host can't be
 * reached, a stored copy is used; otherwise a document that can't be read
 * throws a `ClientMetadataError`.
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
  if (stored?.metadataFetchedAt && Date.now() - stored.metadataFetchedAt.getTime() < METADATA_MAX_AGE) {
    return stored;
  }

  let metadata: ClientMetadata;
  try {
    metadata = await fetchClientMetadataDocument(clientId, options);
  } catch (error) {
    // A host that is down for a while doesn't lock out a client's users; the
    // stored copy is used, and checked again after another hour
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
  const columns = { ...toColumns(metadata), metadataFetchedAt: new Date() };
  const [client] = await db
    .insert(oauthClients)
    .values({ ...columns, id: clientId, kind: "dynamic" })
    .onConflictDoUpdate({ set: columns, target: oauthClients.id })
    .returning();
  return client;
};

/**
 * The client a request to the token or revocation endpoint names, or `null`
 * when it names none, or one that is unknown, disabled or has no readable
 * metadata document; those endpoints answer all of these with `invalid_client`.
 */
export const findRequestClient = async (clientId: string | undefined): Promise<OAuthClient | null> => {
  if (!clientId) {
    return null;
  }
  try {
    return await findClient(clientId);
  } catch (error) {
    if (error instanceof ClientMetadataError) {
      return null;
    }
    throw error;
  }
};
