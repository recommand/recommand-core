import { describeRoute } from "hono-openapi";
import { getPublicKeySet } from "@core/lib/signing-keys";
import { Server } from "@recommand/lib/api";

const server = new Server();

/**
 * The public keys that verify every token the platform signs (RFC 7517), such
 * as OAuth access tokens, in one place, so a key can be rotated by updating one
 * document. The authorization server metadata names it as its `jwks_uri`.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7517#section-5
 */
const _jwks = server.get("/.well-known/jwks.json", describeRoute({ hide: true, security: [] }), async (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(await getPublicKeySet());
});

export type Jwks = typeof _jwks;

export default server;
