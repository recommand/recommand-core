import { oauthAuthorizationCodes, oauthClients, oauthGrants } from "@core/db/schema";
import type { ClientMetadata, ClientMetadataDocument, Fetch } from "@core/lib/oauth/client-metadata";
import {
  ClientMetadataUnavailableError,
  fetchClientMetadataDocument,
  parseClientIdUrl,
} from "@core/lib/oauth/client-metadata";
import type { Lookup } from "@core/lib/oauth/network";
import { db } from "@recommand/db";
import { and, eq, isNotNull, isNull, lt, notExists, or } from "drizzle-orm";

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

/**
 * The stored client a request to the token or revocation endpoint names, or `null`
 * when it names none, or one that is unknown or disabled; those endpoints answer all
 * of these with `invalid_client`. Unlike the authorization endpoint, they never fetch
 * a metadata document: anyone can call them, and a client only gets a token after a
 * user authorized it, which stored it.
 */
export const findRequestClient = async (clientId: string | undefined): Promise<OAuthClient | null> => {
  if (!clientId) {
    return null;
  }

  const [stored] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);

  return stored && !stored.disabledAt ? stored : null;
};

// How long a client without grants is kept, so one a user is about to authorize doesn't disappear
const UNUSED_CLIENT_LIFETIME = 30 * 24 * 60 * 60 * 1_000;

/**
 * Deletes the clients no user has a grant or a code for, and that haven't changed
 * for 30 days: registered clients nobody ever authorized, and metadata documents
 * whose apps were disconnected, which are fetched again when someone authorizes
 * them. A registered client a user authorized stays, since its app may keep the
 * `client_id` and has no way to learn that it should register again. A disabled
 * client stays too, so disabling it can't be undone by waiting. Returns how many it
 * deleted.
 */
export const deleteUnusedClients = async (): Promise<number> => {
  const deleted = await db
    .delete(oauthClients)
    .where(
      and(
        isNull(oauthClients.disabledAt),
        or(isNotNull(oauthClients.metadataFetchedAt), isNull(oauthClients.authorizedAt)),
        lt(oauthClients.updatedAt, new Date(Date.now() - UNUSED_CLIENT_LIFETIME)),
        notExists(db.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.clientId, oauthClients.id))),
        notExists(
          db
            .select({ clientId: oauthAuthorizationCodes.clientId })
            .from(oauthAuthorizationCodes)
            .where(eq(oauthAuthorizationCodes.clientId, oauthClients.id))
        )
      )
    )
    .returning({ id: oauthClients.id });

  return deleted.length;
};
