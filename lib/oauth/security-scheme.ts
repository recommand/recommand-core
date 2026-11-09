import { getDelegablePermissions } from "@core/lib/permissions";

/**
 * The `oauth2` security scheme for the API's OpenAPI document: the authorization
 * code flow, with the permissions an app can be granted as its scopes. An
 * operation lists the permission it checks on this scheme when an app can be
 * granted it (see requirePermission).
 *
 * @see https://spec.openapis.org/oas/v3.1.1.html#oauth-flows-object
 */
export const oauth2SecurityScheme = () => {
  const issuer = process.env.BASE_URL;
  // Refresh tokens are exchanged at the token endpoint too
  const tokenUrl = `${issuer}/api/core/oauth/token`;

  return {
    description: `An access token from the OAuth 2.1 authorization code flow, which requires PKCE with the \`S256\` method. Its scopes are the permissions an app can be granted. The authorization server metadata (RFC 8414) is at ${issuer}/.well-known/oauth-authorization-server.`,
    flows: {
      authorizationCode: {
        authorizationUrl: `${issuer}/oauth/authorize`,
        refreshUrl: tokenUrl,
        scopes: Object.fromEntries(getDelegablePermissions().map((permission) => [permission.id, permission.description ?? permission.name])),
        tokenUrl,
      },
    },
    type: "oauth2" as const,
  };
};
