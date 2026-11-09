import type { OAuthClient } from "@core/data/oauth-clients";
import { getDelegablePermission, getDelegablePermissions } from "@core/lib/permissions";
import { ClientMetadataError } from "./client-metadata";
import { isValidS256CodeChallenge } from "./pkce";
import { matchesRedirectUri } from "./redirect-uri";

// OpenID Connect scopes aren't granted yet, so they're left out of the request
const OIDC_SCOPES = ["email", "openid", "profile"];

export type AuthorizationRequestParameters = {
  client_id?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  redirect_uri?: string;
  resource?: string[];
  response_type?: string;
  scope?: string;
  state?: string;
};

export type AuthorizationRequest = {
  client: OAuthClient;
  codeChallenge: string;
  permissionIds: string[];
  redirectUri: string;
  resources: string[];
  state: string | null;
};

export type AuthorizationRequestResult =
  | { request: AuthorizationRequest; type: "valid" }
  // Without a client and a redirect URI to trust, the user is told instead of redirected
  | { description: string; type: "invalid" }
  | { description: string; error: string; redirectUri: string; state: string | null; type: "redirect" };

/**
 * Checks an authorization request (RFC 6749, section 4.1.1), as OAuth 2.1
 * profiles it (draft-ietf-oauth-v2-1-17, section 4.1.1): only the `code`
 * response type, and only with an S256 PKCE challenge. The requested scope is
 * narrowed to the permissions OAuth clients can be granted and this client may
 * get.
 */
export const parseAuthorizationRequest = async (
  parameters: AuthorizationRequestParameters,
  findClient: (clientId: string) => Promise<OAuthClient | null>
): Promise<AuthorizationRequestResult> => {
  if (!parameters.client_id) {
    return { description: "The request has no client_id", type: "invalid" };
  }

  let client: OAuthClient | null;
  try {
    client = await findClient(parameters.client_id);
  } catch (error) {
    if (error instanceof ClientMetadataError) {
      return { description: error.message, type: "invalid" };
    }
    throw error;
  }
  if (!client) {
    return { description: "The client is unknown or disabled", type: "invalid" };
  }

  const redirectUri = parameters.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!redirectUri) {
    return { description: "The request has no redirect_uri", type: "invalid" };
  }
  if (!matchesRedirectUri(redirectUri, client.redirectUris)) {
    return { description: "The redirect_uri is not registered for this client", type: "invalid" };
  }

  const state = parameters.state ?? null;
  const fail = (error: string, description: string): AuthorizationRequestResult => ({
    description,
    error,
    redirectUri,
    state,
    type: "redirect",
  });

  if (parameters.response_type !== "code") {
    return fail("unsupported_response_type", "Only the code response type is supported");
  }
  if (parameters.code_challenge_method !== "S256" || !parameters.code_challenge) {
    return fail("invalid_request", "A PKCE code_challenge with the S256 method is required");
  }
  if (!isValidS256CodeChallenge(parameters.code_challenge)) {
    return fail("invalid_request", "The code_challenge is not an S256 challenge");
  }

  // A resource indicator is an absolute URI without a fragment (RFC 8707, section 2)
  const resources = parameters.resource ?? [];
  if (!resources.every((resource) => URL.canParse(resource) && !resource.includes("#"))) {
    return fail("invalid_target", "Each resource must be an absolute URI without a fragment");
  }

  const canBeGranted = (permissionId: string) =>
    getDelegablePermission(permissionId) !== null &&
    (client.allowedPermissions === null || client.allowedPermissions.includes(permissionId));
  const requested = (parameters.scope ?? "").split(" ").filter((scope) => scope && !OIDC_SCOPES.includes(scope));
  // Without a scope, the client is offered everything it can be granted, for the user to choose from
  const permissionIds = (requested.length > 0 ? [...new Set(requested)] : getDelegablePermissions().map((permission) => permission.id)).filter(canBeGranted);
  if (permissionIds.length === 0) {
    return fail("invalid_scope", "None of the requested permissions can be granted to this client");
  }

  return {
    request: { client, codeChallenge: parameters.code_challenge, permissionIds, redirectUri, resources, state },
    type: "valid",
  };
};

/** The URL that sends an authorization response back to the client (RFC 9207 adds `iss`). */
export const buildRedirect = (redirectUri: string, parameters: Record<string, string | null>): string => {
  const url = new URL(redirectUri);
  Object.entries(parameters)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .forEach(([name, value]) => url.searchParams.set(name, value));
  return url.href;
};
