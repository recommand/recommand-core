import type { Context } from "hono";

const API_PATH = "/api";
export const MCP_PATH = "/mcp";

/**
 * The resource identifier of this API (RFC 8707). A client names it as
 * `resource` to get a token meant for the API, and the API refuses tokens meant
 * for another resource.
 *
 * @see https://www.rfc-editor.org/rfc/rfc8707#section-2
 */
export const apiResource = () => `${process.env.BASE_URL}${API_PATH}`;

/**
 * The resource identifier of the MCP server. MCP clients name the server's own
 * URL as `resource`, so tokens they get are meant for it rather than the API.
 */
export const mcpResource = () => `${process.env.BASE_URL}${MCP_PATH}`;

/** The resources this authorization server issues tokens for. */
export const supportedResources = () => [apiResource(), mcpResource()];

/** The resource a request is made to: the MCP server, or else the API. */
export const requestResource = (c: Context) => (c.req.path === MCP_PATH ? mcpResource() : apiResource());

/**
 * Where a resource's protected resource metadata is (RFC 9728, section 3.1):
 * the well-known path, followed by the path of the resource identifier.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9728#section-3.1
 */
export const PROTECTED_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${API_PATH}`;
export const MCP_PROTECTED_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

export const protectedResourceMetadataUrl = (resource: string = apiResource()) =>
  `${process.env.BASE_URL}${resource === mcpResource() ? MCP_PROTECTED_RESOURCE_METADATA_PATH : PROTECTED_RESOURCE_METADATA_PATH}`;
