const API_PATH = "/api";

/**
 * The resource identifier of this API (RFC 8707). A client names it as
 * `resource` to get a token meant for the API, and the API refuses tokens meant
 * for another resource.
 */
export const apiResource = () => `${process.env.BASE_URL}${API_PATH}`;

/** The resources this authorization server issues tokens for. */
export const supportedResources = () => [apiResource()];

/**
 * Where the API's protected resource metadata is (RFC 9728, section 3.1): the
 * well-known path, followed by the path of the resource identifier.
 */
export const PROTECTED_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${API_PATH}`;

export const protectedResourceMetadataUrl = () => `${process.env.BASE_URL}${PROTECTED_RESOURCE_METADATA_PATH}`;
