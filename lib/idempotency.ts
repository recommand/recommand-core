import type { IdempotencyKeyRecord } from "@core/data/idempotency-keys";
import {
  completeIdempotencyKey,
  holdIdempotencyKey,
  releaseIdempotencyKey,
  reserveIdempotencyKey,
} from "@core/data/idempotency-keys";
import { describeErrorResponse, validationErrorResponse } from "@core/lib/api-docs";
import type { AuthenticatedTeamContext, AuthenticatedUserContext } from "@core/lib/auth-middleware";
import { actionFailure } from "@recommand/lib/utils";
import { zodResolver } from "@recommand/lib/zod-validator";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createHash } from "node:crypto";
import { z } from "zod";
import "zod-openapi/extend";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** How long a client waits before asking again about a request that is still running. */
const IN_PROGRESS_RETRY_AFTER_SECONDS = 5;

const MAX_KEY_LENGTH = 255;

/**
 * The key a request names, or `null` when it isn't one. The IETF draft defines the
 * header as a Structured Field String, which is quoted (`Idempotency-Key` draft 09,
 * section 2.1), while most clients send the key bare, so both are accepted and mean
 * the same key. A key is 1 to 255 printable ASCII characters, such as a UUID or the
 * client's own document ID. A bare key can't contain a comma: the header sent twice
 * arrives as both values joined by one.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Idempotency-Key
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.1
 */
export const parseIdempotencyKey = (header: string): string | null => {
  const value = header.trim();
  const key = value.startsWith('"') ? unquote(value) : value.includes(",") ? null : value;

  return key !== null && key.length > 0 && key.length <= MAX_KEY_LENGTH && /^[\x20-\x7E]+$/.test(key) ? key : null;
};

/**
 * A Structured Field String's contents, or `null` when it isn't one. Inside the
 * quotes, only `"` and `\` are escaped, each with a `\` (RFC 9651, section 3.3.3).
 *
 * @see https://www.rfc-editor.org/rfc/rfc9651.html#section-3.3.3
 */
const unquote = (value: string): string | null => {
  const contents = /^"((?:[^"\\]|\\["\\])*)"$/.exec(value)?.[1];

  return contents === undefined ? null : contents.replace(/\\(["\\])/g, "$1");
};

const byName = ([left]: [string, unknown], [right]: [string, unknown]) => (left < right ? -1 : left > right ? 1 : 0);

/** The same value with object keys sorted, so two requests that differ only in key order match. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(byName)
        .map(([key, entry]) => [key, canonical(entry)])
    );
  }

  return value;
};

/** A JSON body as the value it parses to, or a body that isn't JSON as it was sent. */
const parseBody = (body: string): unknown => {
  try {
    return canonical(JSON.parse(body));
  } catch {
    return body;
  }
};

/**
 * A query string with its parameters sorted by name, so two requests that differ only
 * in their order match. A parameter given more than once keeps the order of its values.
 */
const canonicalQuery = (query: string) => new URLSearchParams([...new URLSearchParams(query)].toSorted(byName)).toString();

/**
 * What a request asks for, to tell a repeat of it from another request under the
 * same key: its method, its path with the resource IDs in it, its query parameters
 * and its body.
 *
 * A JSON body is compared by the value it parses to, as the route reads it, so its
 * whitespace and key order don't matter. Two numbers that a JavaScript number can't
 * tell apart, such as `12345678901234567890` and `12345678901234567891`, then
 * compare as the same, and of a key an object has twice, only the last value counts.
 */
export const fingerprintRequest = (request: { body: string; method: string; path: string; query: string }) =>
  createHash("sha256")
    .update(JSON.stringify([request.method, request.path, canonicalQuery(request.query), parseBody(request.body)]))
    .digest("hex");

type IdempotentContext = AuthenticatedUserContext & AuthenticatedTeamContext;

export type IdempotencyOptions = {
  /**
   * The documentation on retrying the route with a key, which an answer about a key
   * used wrongly links to with `Link: <…>; rel="describedby"`, as the IETF draft asks
   * (`Idempotency-Key` draft 09, section 2.7).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Idempotency-Key
   * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.7
   */
  documentationUrl: string;
  /**
   * What a key is unique within, next to the team: the operation, and the company it
   * acts for when it acts for one, such as `peppol.send_document:c_123`.
   */
  scope: (c: Context<IdempotentContext>) => string;
};

const ANSWERED = "idempotencyAnswered";
const REFUSED = "idempotencyRefused";

/**
 * Whether the middleware answered the request itself, with a replay or a refusal of
 * its key, so the route didn't run.
 */
export const answeredByIdempotency = (c: Context) => !!c.get(ANSWERED as never);

/**
 * Marks a request the route refused before it did anything, such as one whose
 * input it can't act on, so its `Idempotency-Key` is freed and the client can fix
 * the request and retry under it. Any other failure keeps the key reserved.
 */
export const markRefused = (c: Context) => {
  c.set(REFUSED as never, true as never);
};

const failure = (c: Context, status: 400 | 409 | 422, message: string, code: string) => {
  c.set(ANSWERED as never, true as never);

  return c.json({ ...actionFailure(message), code }, status);
};

/** Links the documentation on using a key, for an answer that says the client used one wrongly. */
const linkDocumentation = (c: Context, url: string) => {
  c.header("Link", `<${url}>; rel="describedby"`);
};

const replay = (record: IdempotencyKeyRecord) =>
  new Response(record.responseBody, {
    headers: {
      ...(record.responseContentType ? { "Content-Type": record.responseContentType } : {}),
      "Idempotency-Key-Expires-At": record.expiresAt.toISOString(),
      "Idempotency-Replayed": "true",
    },
    status: record.responseStatus ?? 200,
  });

/**
 * Frees the key of a request the route refused, or stores the response it ended with,
 * whatever its status, and says until when the key holds it.
 */
const storeOutcome = async (c: Context, id: string) => {
  if (c.get(REFUSED as never)) {
    await releaseIdempotencyKey(id);

    return null;
  }

  return completeIdempotencyKey(id, {
    body: await c.res.clone().text(),
    contentType: c.res.headers.get("Content-Type"),
    status: c.res.status,
  });
};

/**
 * Makes a route safe to retry with the `Idempotency-Key` header (`Idempotency-Key`
 * draft 09, sections 2.6 and 2.7): a request that names a key runs once, and a repeat
 * of it gets the first response back instead of running again. It goes after
 * authentication and input validation, so a replay is still authorized and a request
 * with invalid input never reserves its key.
 *
 * - The response a request ends with, success or failure, is kept with the key for a
 *   day, and replayed with `Idempotency-Replayed: true`. A failed request may have
 *   done what it was for before it failed, and running it again could do it twice.
 *   Only a request the route marks with `markRefused()` frees its key, since nothing
 *   happened.
 * - A different request under the same key gets `422` with `idempotency_conflict`, as
 *   the draft has it: the request itself is wrong for its key.
 *   A repeat while the first is running gets `409` with `idempotency_in_progress` and
 *   `Retry-After`. A repeat after the first ended without its response being stored,
 *   such as when the server stopped during it, gets `409` with
 *   `idempotency_outcome_unknown`: there's no response to repeat, and waiting won't
 *   change that answer.
 * - The `400` for an invalid key and the `422` for a key used for a different request
 *   link the route's documentation.
 *
 * Where this departs from the draft: a bare key is taken next to the quoted String of
 * section 2.1, a request refused before anything happened frees its key for a
 * corrected request, where section 2.2 asks for a new key, and a repeat without a
 * stored response gets `409`, which section 2.7 has only for a request still running.
 *
 * Without the header, or with an empty one, the route runs as it always did.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Idempotency-Key
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.1
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.2
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.6
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.7
 */
export const idempotent = (options: IdempotencyOptions) =>
  createMiddleware<IdempotentContext>(async (c, next) => {
    const header = c.req.header(IDEMPOTENCY_KEY_HEADER);
    if (header === undefined || header.trim() === "") {
      return next();
    }

    const key = parseIdempotencyKey(header);
    if (key === null) {
      linkDocumentation(c, options.documentationUrl);

      return failure(
        c,
        400,
        `The ${IDEMPOTENCY_KEY_HEADER} header must be 1 to ${MAX_KEY_LENGTH} printable ASCII characters, optionally in double quotes, and sent once.`,
        "invalid_idempotency_key"
      );
    }

    const reservation = await reserveIdempotencyKey({
      fingerprint: fingerprintRequest({
        body: await c.req.text(),
        method: c.req.method,
        path: c.req.path,
        query: new URL(c.req.url).search,
      }),
      key,
      scope: options.scope(c),
      teamId: c.var.team.id,
    });
    if (reservation.outcome === "conflict") {
      linkDocumentation(c, options.documentationUrl);

      return failure(
        c,
        422,
        `This ${IDEMPOTENCY_KEY_HEADER} was already used for a different request. Use a new key for a new request.`,
        "idempotency_conflict"
      );
    }

    if (reservation.outcome === "in_progress") {
      c.header("Retry-After", String(IN_PROGRESS_RETRY_AFTER_SECONDS));

      return failure(
        c,
        409,
        `A request with this ${IDEMPOTENCY_KEY_HEADER} is still running. Retry later.`,
        "idempotency_in_progress"
      );
    }

    if (reservation.outcome === "outcome_unknown") {
      return failure(
        c,
        409,
        `A request with this ${IDEMPOTENCY_KEY_HEADER} ended without a response to repeat, so it's unknown whether it took effect, and it isn't run again under this key. Check whether the first request took effect before sending again under a new key.`,
        "idempotency_outcome_unknown"
      );
    }

    if (reservation.outcome === "completed") {
      c.set(ANSWERED as never, true as never);

      return replay(reservation.record);
    }

    await next();

    // The request already did what it did, so failing to note that with the key
    // mustn't change its response
    const expiresAt = await storeOutcome(c, reservation.id).catch(async (error) => {
      console.error(`Failed to store the outcome of the request under ${IDEMPOTENCY_KEY_HEADER} ${reservation.id}`, error);
      // So a repeat is told there's no response to repeat, rather than to keep waiting
      // for a request that has ended. A refused request's key that couldn't be freed
      // is left reserved, which is safe: nothing happened, but a repeat is held back.
      if (!c.get(REFUSED as never)) {
        await holdIdempotencyKey(reservation.id).catch(() => {});
      }

      return null;
    });
    if (expiresAt) {
      c.header("Idempotency-Key-Expires-At", expiresAt.toISOString());
    }
  });

/** The request header, for a route's OpenAPI `parameters`. */
export const idempotencyKeyParameter = {
  description:
    "A key that makes the request safe to retry: a repeat of the request under the same key returns the first response, whatever its status, instead of running again. Use a new key for every new request, such as a UUID or your own ID for what you send. Keys are 1 to 255 printable ASCII characters, scoped to your team, this operation and what it acts on, such as the company, and kept for at least 24 hours after the request finished. A different request under the same key, with another body or query or through another path, is refused with `422` and code `idempotency_conflict`; a JSON body is compared by its contents, so its whitespace and key order don't matter. A repeat while the first request is still running gets `409` with code `idempotency_in_progress` and a `Retry-After` header. A request refused before anything happened, such as one with invalid content, doesn't use up its key, so you can fix it and retry under the same key. After any other failure the key stays used until it expires, because the request may have taken effect, and a repeat gets the same failure again. A repeat of a request that ended without a response to repeat, such as one still unfinished after 10 minutes, gets `409` with code `idempotency_outcome_unknown`: check whether the first request took effect before sending again under a new key. The value may be sent bare or quoted, as the IETF draft defines it (https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header), and only once; an invalid key is refused with `400` and code `invalid_idempotency_key`.",
  in: "header" as const,
  name: IDEMPOTENCY_KEY_HEADER,
  required: false,
  schema: {
    examples: ["8e03978e-40d5-43e8-bc93-6894a57f9324"],
    // Quoted, the value is two characters longer than the key
    maxLength: MAX_KEY_LENGTH + 2,
    minLength: 1,
    type: "string" as const,
  },
};

/** The headers of a successful response to a request that named an `Idempotency-Key`. */
export const idempotencyResponseHeaders = {
  "Idempotency-Key-Expires-At": {
    description:
      "When the key stops holding this response, in ISO 8601. Sent when the request named an `Idempotency-Key`. After that, the same key starts a new request.",
    schema: { examples: ["2026-11-14T16:20:36.000Z"], format: "date-time", type: "string" as const },
  },
  "Idempotency-Replayed": {
    description:
      "`true` when this is the stored response to an earlier request with the same `Idempotency-Key`, rather than a new one.",
    schema: { enum: ["true"], type: "string" as const },
  },
};

/** The `Link` to the documentation that an answer about a key used wrongly carries. */
const documentationLinkHeader = {
  Link: {
    description:
      "With an `Idempotency-Key` error code: the documentation on retrying with an `Idempotency-Key`, as `<URL>; rel=\"describedby\"`.",
    schema: { type: "string" as const },
  },
};

/**
 * The `400` of an idempotent route: its input didn't match, or its `Idempotency-Key`
 * isn't one, with code `invalid_idempotency_key` and a `Link` to the documentation.
 */
export const describeIdempotentValidationErrorResponse = (description: string) => ({
  400: {
    content: {
      "application/json": {
        schema: zodResolver(
          validationErrorResponse.extend({
            code: z.enum(["invalid_idempotency_key"]).optional().openapi({
              description: "Set when the `Idempotency-Key` header isn't a valid key.",
            }),
          })
        ),
      },
    },
    description,
    headers: documentationLinkHeader,
  },
});

const idempotencyFailureResponse = z.object({
  code: z
    .enum(["idempotency_in_progress", "idempotency_outcome_unknown"])
    .openapi({
      description: "Why the request was refused.",
    }),
});

/** The `409` an idempotent route answers, with its `Retry-After`. */
export const describeIdempotencyConflictResponse = () => {
  const response = describeErrorResponse(
    409,
    "A request with the `Idempotency-Key` is still running (`idempotency_in_progress`, with `Retry-After`), or one ended without a response to repeat (`idempotency_outcome_unknown`).",
    idempotencyFailureResponse
  );

  return {
    409: {
      ...response[409],
      headers: {
        "Retry-After": {
          description: "With `idempotency_in_progress`: how many seconds to wait before retrying.",
          schema: { examples: [5], minimum: 0, type: "integer" as const },
        },
      },
    },
  };
};

/**
 * The `422` of an idempotent route: the route's own `422`, described by `bodySchema`,
 * or an `Idempotency-Key` already used for a different request, with code
 * `idempotency_conflict` and a `Link` to the documentation. The IETF draft answers that
 * with `422` (`Idempotency-Key` draft 09, section 2.7), so a route that answers `422`
 * itself tells the two apart by `code`. The route's own `422` is kept with the key and
 * replayed like a success, with the same response headers.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Idempotency-Key
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-09#section-2.7
 */
export const describeIdempotentUnprocessableResponse = (
  description: string,
  bodySchema: z.AnyZodObject = z.object({})
) => {
  const response = describeErrorResponse(
    422,
    description,
    bodySchema.extend({
      code: z
        .enum(["idempotency_conflict"])
        .optional()
        .openapi({
          description: "Set when the `Idempotency-Key` was already used for a different request.",
        }),
    })
  );

  return {
    422: {
      ...response[422],
      headers: { ...idempotencyResponseHeaders, ...documentationLinkHeader },
    },
  };
};
