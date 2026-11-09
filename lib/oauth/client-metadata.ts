import { z } from "zod";
import type { Lookup } from "./network";
import { defaultLookup, NonPublicAddressError, resolvePublicAddresses } from "./network";
import { isAllowedRedirectUri } from "./redirect-uri";

export type Fetch = (input: URL, init: RequestInit) => Promise<Response>;

export class ClientMetadataError extends Error {}

/** The document's host couldn't be reached or failed to answer, which may pass. */
export class ClientMetadataUnavailableError extends ClientMetadataError {}

const isHttpsUrl = (value: string) => URL.canParse(value) && new URL(value).protocol === "https:";

/**
 * The client metadata this server reads (RFC 7591, section 2); other fields are
 * ignored. Only clients without a secret are supported, so they authenticate at
 * the token endpoint with `none`: a client must list it among the methods it
 * supports, or name no method at all (Client ID Metadata Document,
 * draft-ietf-oauth-client-id-metadata-document-03, section 5).
 *
 * @see https://www.rfc-editor.org/rfc/rfc7591#section-2
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-5
 */
export const clientMetadataSchema = z
  .object({
    client_name: z.string().trim().min(1).max(200).optional(),
    client_uri: z.string().refine(isHttpsUrl, "Must be an https URL").optional(),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .min(1)
      .refine((grantTypes) => grantTypes.includes("authorization_code"), "Must include authorization_code")
      .default(["authorization_code"]),
    logo_uri: z.string().refine(isHttpsUrl, "Must be an https URL").optional(),
    redirect_uris: z
      .array(z.string().refine(isAllowedRedirectUri, "Must be an https URI, or http on a loopback address"))
      .min(1)
      .max(20),
    response_types: z.array(z.literal("code")).min(1).default(["code"]),
    token_endpoint_auth_method: z.string().optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).min(1).optional(),
  })
  .superRefine(({ token_endpoint_auth_method: method, token_endpoint_auth_methods_supported: supported }, context) => {
    if (method !== undefined && supported !== undefined && !supported.includes(method)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be one of token_endpoint_auth_methods_supported",
        path: ["token_endpoint_auth_method"],
      });
    }

    // The list replaces the single method; without either, the client has no secret, rather
    // than RFC 7591's default of `client_secret_basic`
    const methods = supported ?? [method ?? "none"];
    if (!methods.includes("none")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must include none",
        path: [supported === undefined ? "token_endpoint_auth_method" : "token_endpoint_auth_methods_supported"],
      });
    }
  })
  .transform(({ token_endpoint_auth_methods_supported: _supported, ...metadata }) => ({
    ...metadata,
    token_endpoint_auth_method: "none" as const,
  }));

export type ClientMetadata = z.infer<typeof clientMetadataSchema>;

/**
 * Whether `clientId` can name a Client ID Metadata Document: an `https` URL on
 * the default port with a path, and without a fragment, credentials or dot
 * segments. A URL the parser would rewrite, such as one with `/../`, is refused,
 * so the `client_id` is always the exact URL that was fetched.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-3
 */
export const parseClientIdUrl = (clientId: string): URL | null => {
  if (!URL.canParse(clientId) || clientId.includes("#")) {
    return null;
  }

  const url = new URL(clientId);
  const isCanonical = url.href === clientId;
  if (!isCanonical || url.protocol !== "https:" || url.port || url.username || url.password || url.pathname === "/") {
    return null;
  }

  return url;
};

const readBody = async (response: Response, maxBytes: number): Promise<string> => {
  if (Number(response.headers.get("Content-Length") ?? 0) > maxBytes || !response.body) {
    throw new ClientMetadataError(`The client metadata document is larger than ${maxBytes} bytes`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ClientMetadataError(`The client metadata document is larger than ${maxBytes} bytes`);
    }

    chunks.push(chunk.value);
  }

  return Buffer.concat(chunks).toString("utf-8");
};

// How long a stored copy is used: what the document's `Cache-Control` says, but at least
// five minutes, so a client can't make the server fetch it for every request, and at most
// a day, so a changed document is seen again. An hour when it says nothing.
const MIN_MAX_AGE_SECONDS = 5 * 60;
const MAX_MAX_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_MAX_AGE_SECONDS = 60 * 60;

const documentMaxAge = (response: Response): number => {
  const directives = (response.headers.get("Cache-Control") ?? "").toLowerCase().split(",").map((directive) => directive.trim());
  if (directives.includes("no-store") || directives.includes("no-cache")) {
    return MIN_MAX_AGE_SECONDS;
  }

  const seconds = Number(directives.find((directive) => directive.startsWith("max-age="))?.slice("max-age=".length));

  return Number.isInteger(seconds) && seconds >= 0 ? Math.min(Math.max(seconds, MIN_MAX_AGE_SECONDS), MAX_MAX_AGE_SECONDS) : DEFAULT_MAX_AGE_SECONDS;
};

export type ClientMetadataDocument = {
  // How long, in seconds, the metadata may be used before the document is fetched again
  maxAgeSeconds: number;
  metadata: ClientMetadata;
};

/**
 * Fetches and checks the Client ID Metadata Document `clientId` points at. Only a
 * public address is contacted, redirects aren't followed, and the request gives
 * up after `timeoutMs` or `maxBytes`. A document that names a method needing a
 * shared secret is refused, since anyone can read it (Client ID Metadata
 * Document, draft-ietf-oauth-client-id-metadata-document-03, section 4.1), and
 * its `Cache-Control` says how long the metadata may be used, within limits
 * (section 6.2).
 *
 * The host is resolved before the request is made, so a host that changes its
 * answer in between could still be reached at another address.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-4.1
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-6.2
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-6.2
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-10.7
 */
export const fetchClientMetadataDocument = async (
  clientId: string,
  {
    fetch: fetchDocument = fetch,
    lookup = defaultLookup,
    maxBytes = 5_120,
    timeoutMs = 5_000,
  }: { fetch?: Fetch; lookup?: Lookup; maxBytes?: number; timeoutMs?: number } = {}
): Promise<ClientMetadataDocument> => {
  const url = parseClientIdUrl(clientId);
  if (!url) {
    throw new ClientMetadataError("The client_id is not a URL a client metadata document can be fetched from");
  }

  try {
    await resolvePublicAddresses(url.hostname, lookup);
  } catch (error) {
    // A host that doesn't resolve may be down for a while; one with a private address never qualifies
    const message = error instanceof Error ? error.message : String(error);
    throw error instanceof NonPublicAddressError
      ? new ClientMetadataError(message)
      : new ClientMetadataUnavailableError(`The client metadata document's host could not be resolved: ${message}`);
  }

  let response: Response;
  try {
    response = await fetchDocument(url, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ClientMetadataUnavailableError(`The client metadata document could not be fetched: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Too busy or failing for now
  if (response.status === 429 || response.status >= 500) {
    throw new ClientMetadataUnavailableError(`The client metadata document answered ${response.status}`);
  }

  if (response.status !== 200) {
    throw new ClientMetadataError(`The client metadata document answered ${response.status}`);
  }

  let document: unknown;
  try {
    document = JSON.parse(await readBody(response, maxBytes));
  } catch (error) {
    throw error instanceof ClientMetadataError ? error : new ClientMetadataError("The client metadata document is not JSON");
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new ClientMetadataError("The client metadata document is not a JSON object");
  }

  if ((document as { client_id?: unknown }).client_id !== clientId) {
    throw new ClientMetadataError("The client metadata document names another client_id");
  }

  // A document anyone can read can't carry a secret
  if ("client_secret" in document || "client_secret_expires_at" in document) {
    throw new ClientMetadataError("The client metadata document contains a client secret");
  }

  const { token_endpoint_auth_method: method, token_endpoint_auth_methods_supported: supported } = document as {
    token_endpoint_auth_method?: unknown;
    token_endpoint_auth_methods_supported?: unknown;
  };
  const methods = [method, ...(Array.isArray(supported) ? supported : [])];
  if (methods.some((name) => typeof name === "string" && name.startsWith("client_secret_"))) {
    throw new ClientMetadataError("The client metadata document names an authentication method that needs a shared secret");
  }

  const metadata = clientMetadataSchema.safeParse(document);
  if (!metadata.success) {
    throw new ClientMetadataError(`The client metadata document is invalid: ${metadata.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }

  return { maxAgeSeconds: documentMaxAge(response), metadata: metadata.data };
};
