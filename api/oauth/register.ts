import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { registerDynamicClient } from "@core/data/oauth-clients";
import { audit } from "@core/lib/audit";
import { clientMetadataSchema } from "@core/lib/oauth/client-metadata";
import { Server } from "@recommand/lib/api";
import { describeOAuthResponse, oauthErrorSchema } from "./responses";

const server = new Server();

const registeredClientSchema = z
  .object({
    client_id: z.string(),
    client_id_issued_at: z.number().int().openapi({ description: "When the client was registered, in seconds since the epoch." }),
    client_name: z.string().optional(),
    client_uri: z.string().optional(),
    grant_types: z.array(z.string()),
    logo_uri: z.string().optional(),
    redirect_uris: z.array(z.string()),
    response_types: z.array(z.string()),
    token_endpoint_auth_method: z.string(),
  })
  .openapi({ ref: "OAuthRegisteredClient" });

/**
 * Dynamic client registration (RFC 7591), for clients that can't publish a
 * Client ID Metadata Document. The server picks the `client_id`; a client
 * can't ask for a secret, so it authenticates with `none`.
 */
const _register = server.post(
  "/oauth/register",
  describeRoute({
    description: "Register a public OAuth client (RFC 7591). The server picks its `client_id`.",
    hide: true,
    operationId: "registerOAuthClient",
    responses: {
      ...describeOAuthResponse(201, "The client was registered", registeredClientSchema),
      ...describeOAuthResponse(400, "The client metadata is invalid", oauthErrorSchema),
    },
    security: [],
    summary: "Register an OAuth Client",
    tags: ["OAuth"],
  }),
  async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const metadata = clientMetadataSchema.safeParse(body);
    if (!metadata.success) {
      const issue = metadata.error.issues[0];
      return c.json(
        {
          error: issue.path[0] === "redirect_uris" ? "invalid_redirect_uri" : "invalid_client_metadata",
          error_description: `${issue.path.join(".") || "body"}: ${issue.message}`,
        },
        400
      );
    }

    const client = await registerDynamicClient(metadata.data);
    await audit(c, {
      action: "create",
      metadata: { redirectUris: client.redirectUris },
      objectId: client.id,
      objectType: "core.oauth_client",
      subsystem: "core.oauth",
    });

    return c.json(
      {
        client_id: client.id,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1_000),
        ...(client.name ? { client_name: client.name } : {}),
        ...(client.clientUri ? { client_uri: client.clientUri } : {}),
        grant_types: client.grantTypes,
        ...(client.logoUri ? { logo_uri: client.logoUri } : {}),
        redirect_uris: client.redirectUris,
        response_types: metadata.data.response_types,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      },
      201
    );
  }
);

export type OAuthRegister = typeof _register;

export default server;
