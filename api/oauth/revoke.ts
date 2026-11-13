import { describeRoute } from "hono-openapi";
import { findRequestClient } from "@core/data/oauth-clients";
import { revokeToken } from "@core/data/oauth-tokens";
import { audit } from "@core/lib/audit";
import { Server } from "@recommand/lib/api";
import { describeOAuthResponse, oauthErrorSchema } from "./responses";

const server = new Server();

/**
 * Token revocation (RFC 7009), for a client that signs out or no longer needs a
 * token. It answers the same whether or not anything was revoked, so it can't
 * be used to find out which tokens exist.
 */
const _revoke = server.post(
  "/oauth/revoke",
  describeRoute({
    description: "Revoke an access or refresh token (RFC 7009). The answer is the same whether or not anything was revoked.",
    hide: true,
    operationId: "revokeOAuthToken",
    responses: {
      ...describeOAuthResponse(200, "The token is no longer valid"),
      ...describeOAuthResponse(400, "The client is unknown or the request has no token", oauthErrorSchema),
    },
    security: [],
    summary: "Revoke an OAuth Token",
    tags: ["OAuth"],
  }),
  async (c) => {
    const form: Record<string, unknown> = await c.req.parseBody().catch(() => ({}));
    const token = typeof form.token === "string" ? form.token : null;
    const client = await findRequestClient(typeof form.client_id === "string" ? form.client_id : undefined);
    if (!client) {
      return c.json({ error: "invalid_client", error_description: "The client is unknown or disabled" }, 400);
    }
    if (!token) {
      return c.json({ error: "invalid_request", error_description: "The request has no token" }, 400);
    }

    // The token's prefix tells its type, so `token_type_hint` isn't needed
    const revoked = await revokeToken(token, client.id);
    if (revoked) {
      await audit(c, {
        action: "revoke_access",
        metadata: { tokenType: revoked.type },
        objectId: revoked.grantId,
        objectType: "core.oauth_grant",
        reasonCode: "client_revoked",
        subsystem: "core.oauth",
      });
    }

    return c.body(null, 200);
  }
);

export type OAuthRevoke = typeof _revoke;

export default server;
