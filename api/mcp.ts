import type { AuthenticatedUserContext } from "@core/lib/auth-middleware";
import { audit } from "@core/lib/audit";
import { createRequestServer } from "@core/lib/mcp/server";
import { presentsOAuthAccessToken, setBearerChallenge } from "@core/lib/oauth/bearer";
import { MCP_PATH } from "@core/lib/oauth/resource";
import { verifySession } from "@core/lib/session";
import { createMcpHandler, originValidationResponse, ProtocolErrorCode, readRequestBody } from "@modelcontextprotocol/server";
import { Server } from "@recommand/lib/api";
import { actionFailure } from "@recommand/lib/utils";
import type { Context } from "hono";
import { describeRoute } from "hono-openapi";

const server = new Server<AuthenticatedUserContext>();

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * The `subscriptions/listen` request a client sends, if this is one. Nothing is
 * ever published to subscribers, so it's a method this server doesn't offer.
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions
 */
const listenRequest = async (request: Request): Promise<{ id?: unknown } | null> => {
  if (request.method !== "POST") {
    return null;
  }

  // Read within the SDK's own size limit, which answers an oversized request itself
  const body = await readRequestBody(request.clone());
  if (body.tooLarge) {
    return null;
  }

  const message = parseJson(body.text);
  const isListen =
    !!message && typeof message === "object" && !Array.isArray(message) && "method" in message && message.method === "subscriptions/listen";

  return isListen ? (message as { id?: unknown }) : null;
};

/**
 * Serves both the stateless 2026-07-28 protocol and, for the many clients that
 * still need it, the 2025 handshake, each request with a server made for its
 * credential. The request's Hono context reaches the factory through `authInfo`.
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
 */
const handler = createMcpHandler(
  (context) => createRequestServer(context.authInfo?.extra?.context as Context<AuthenticatedUserContext>),
  {
    // No stream is ever held open, also for a listen request the check below misses
    maxSubscriptions: 0,
    onerror: (error) => {
      console.error("MCP request failed", error);
    },
  }
);

/**
 * The MCP server (Streamable HTTP). It takes an OAuth access token or an API
 * key, not a browser session, which a page on another site could otherwise
 * make calls with.
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
 */
const _mcp = server.all(MCP_PATH, describeRoute({ hide: true }), async (c) => {
  // A browser request from another site is refused before anything else (Streamable HTTP, Security & Endpoint)
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin
  // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security-&-endpoint
  const otherOrigin = originValidationResponse(c.req.raw, [new URL(process.env.BASE_URL!).hostname]);
  if (otherOrigin) {
    return otherOrigin;
  }

  const session = await verifySession(c);
  if (!session || c.get("authenticationMethod") === "cookie") {
    await audit(c, {
      action: "authorize",
      objectId: MCP_PATH,
      objectType: "core.route",
      outcome: "denied",
      // A browser session is authenticated, but refused here all the same
      reasonCode: session ? "session_refused" : "unauthenticated",
      subsystem: "core.mcp",
    });
    // Tells an MCP client where to sign in (RFC 9728, section 5.1), or that its token is no longer valid
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/WWW-Authenticate
    // https://www.rfc-editor.org/rfc/rfc9728#section-5.1
    setBearerChallenge(c, presentsOAuthAccessToken(c) ? { error: "invalid_token" } : {});

    return c.json(actionFailure("Unauthorized"), 401);
  }

  // A method the server doesn't offer, rather than the internal error the SDK answers it with
  const listen = await listenRequest(c.req.raw);
  if (listen) {
    return c.json({
      error: { code: ProtocolErrorCode.MethodNotFound, message: "Method not found" },
      id: listen.id ?? null,
      jsonrpc: "2.0",
    });
  }

  return handler.fetch(c.req.raw, {
    authInfo: { clientId: c.get("grant")?.clientId ?? "", extra: { context: c }, scopes: [], token: "" },
  });
});

export type Mcp = typeof _mcp;

export default server;
