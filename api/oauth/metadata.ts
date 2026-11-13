import { describeRoute } from "hono-openapi";
import { JWT_BEARER_GRANT_TYPE } from "@core/lib/oauth/jwt-bearer";
import { apiResource, PROTECTED_RESOURCE_METADATA_PATH } from "@core/lib/oauth/resource";
import { getDelegablePermissions } from "@core/lib/permissions";
import { Server } from "@recommand/lib/api";

const server = new Server();

const delegableScopes = () => getDelegablePermissions().map((permission) => permission.id);

/**
 * Authorization server metadata (RFC 8414), which clients read to find the
 * endpoints and what this server supports. The issuer has no path, so the
 * document sits at the root of the well-known prefix.
 *
 * @see https://www.rfc-editor.org/rfc/rfc8414#section-3
 */
const _authorizationServer = server.get(
  "/.well-known/oauth-authorization-server",
  describeRoute({ hide: true, security: [] }),
  (c) => {
    const issuer = process.env.BASE_URL!;
    return c.json({
      authorization_endpoint: `${issuer}/oauth/authorize`,
      // The authorization response names the issuer (RFC 9207)
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", JWT_BEARER_GRANT_TYPE, "refresh_token"],
      issuer,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      registration_endpoint: `${issuer}/api/core/oauth/register`,
      response_types_supported: ["code"],
      revocation_endpoint: `${issuer}/api/core/oauth/revoke`,
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: delegableScopes(),
      token_endpoint: `${issuer}/api/core/oauth/token`,
      token_endpoint_auth_methods_supported: ["none"],
    });
  }
);

/**
 * Protected resource metadata (RFC 9728) for this API: its resource identifier
 * and the authorization server that issues tokens for it.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9728#section-3
 */
const _protectedResource = server.get(
  PROTECTED_RESOURCE_METADATA_PATH,
  describeRoute({ hide: true, security: [] }),
  (c) =>
    c.json({
      authorization_servers: [process.env.BASE_URL!],
      bearer_methods_supported: ["header"],
      resource: apiResource(),
      scopes_supported: delegableScopes(),
    })
);

export type OAuthMetadata = typeof _authorizationServer | typeof _protectedResource;

export default server;
