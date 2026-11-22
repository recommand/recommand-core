import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

// Parsing and fingerprinting don't touch the database the middleware's module loads
mock.module("@recommand/db", () => ({ db: {} }));
// The middleware's answers are tested against what the key store reports, which is
// tested against PostgreSQL where a route uses it
let reservation: { outcome: string; record?: unknown };
mock.module("@core/data/idempotency-keys", () => ({
  completeIdempotencyKey: async () => {},
  holdIdempotencyKey: async () => {},
  releaseIdempotencyKey: async () => {},
  reserveIdempotencyKey: async () => reservation,
}));
const { fingerprintRequest, idempotent, parseIdempotencyKey } = await import("../lib/idempotency");

describe("parseIdempotencyKey", () => {
  it("takes a key sent bare, as most clients send it", () => {
    expect(parseIdempotencyKey("8e03978e-40d5-43e8-bc93-6894a57f9324")).toBe("8e03978e-40d5-43e8-bc93-6894a57f9324");
    expect(parseIdempotencyKey(" invoice 2026/0042 ")).toBe("invoice 2026/0042");
  });

  it("takes a key sent as a Structured Field String, as the draft defines it, as the same key", () => {
    expect(parseIdempotencyKey('"8e03978e-40d5-43e8-bc93-6894a57f9324"')).toBe("8e03978e-40d5-43e8-bc93-6894a57f9324");
    expect(parseIdempotencyKey('"say \\"hi\\" \\\\ bye"')).toBe('say "hi" \\ bye');
    // Inside quotes, a comma is part of the key
    expect(parseIdempotencyKey('"invoice 1, version 2"')).toBe("invoice 1, version 2");
  });

  it("refuses what isn't a key", () => {
    expect(parseIdempotencyKey("")).toBeNull();
    expect(parseIdempotencyKey('""')).toBeNull();
    expect(parseIdempotencyKey("x".repeat(256))).toBeNull();
    expect(parseIdempotencyKey("café")).toBeNull();
    // The header sent twice, which arrives as both values joined by a comma
    expect(parseIdempotencyKey("first, second")).toBeNull();
    // An escape the string syntax doesn't have, or a quote that ends it early
    expect(parseIdempotencyKey('"a\\b"')).toBeNull();
    expect(parseIdempotencyKey('"a"b"')).toBeNull();
    expect(parseIdempotencyKey('"a\\\\"b"')).toBeNull();
    expect(parseIdempotencyKey('"unterminated')).toBeNull();
  });

  it("takes keys up to 255 characters", () => {
    expect(parseIdempotencyKey("x".repeat(255))).toBe("x".repeat(255));
  });
});

describe("fingerprintRequest", () => {
  const request = {
    body: '{"recipient":"0208:0123456789","document":{"invoiceNumber":"1","lines":[1,2]}}',
    method: "POST",
    path: "/api/v1/c_1/send",
    query: "?format=json&tag=a&tag=b",
  };

  it("matches a repeat of the request, whatever the order of its JSON keys or its whitespace", () => {
    expect(
      fingerprintRequest({
        ...request,
        body: '{ "document": { "lines": [1, 2], "invoiceNumber": "1" }, "recipient": "0208:0123456789" }',
      })
    ).toBe(fingerprintRequest(request));
  });

  it("matches a repeat of the request whose query parameters come in another order", () => {
    expect(fingerprintRequest({ ...request, query: "?tag=a&format=json&tag=b" })).toBe(fingerprintRequest(request));
  });

  it("tells apart a request with other contents, another query, another path or another method", () => {
    const fingerprint = fingerprintRequest(request);
    expect(fingerprintRequest({ ...request, body: request.body.replace('"1"', '"2"') })).not.toBe(fingerprint);
    expect(fingerprintRequest({ ...request, body: request.body.replace("[1,2]", "[2,1]") })).not.toBe(fingerprint);
    expect(fingerprintRequest({ ...request, query: "?format=xml&tag=a&tag=b" })).not.toBe(fingerprint);
    // A repeated parameter's values keep their order
    expect(fingerprintRequest({ ...request, query: "?format=json&tag=b&tag=a" })).not.toBe(fingerprint);
    expect(fingerprintRequest({ ...request, query: "" })).not.toBe(fingerprint);
    expect(fingerprintRequest({ ...request, path: "/api/v1/c_2/send" })).not.toBe(fingerprint);
    expect(fingerprintRequest({ ...request, method: "PUT" })).not.toBe(fingerprint);
  });

  it("compares a body that isn't JSON as it was sent", () => {
    const fingerprint = fingerprintRequest({ ...request, body: "<Invoice/>" });
    expect(fingerprintRequest({ ...request, body: "<Invoice/>" })).toBe(fingerprint);
    expect(fingerprintRequest({ ...request, body: "<Invoice />" })).not.toBe(fingerprint);
  });
});

describe("idempotent", () => {
  const documentationUrl = "https://docs.example.com/retrying";
  const app = new Hono()
    .use(async (c, next) => {
      c.set("team" as never, { id: "team_1" } as never);
      await next();
    })
    .post("/send", idempotent({ documentationUrl, scope: () => "send" }), (c) => c.json({ success: true }));

  const send = async (key = "one-key") => {
    const response = await app.request("/send", { body: "{}", headers: { "Idempotency-Key": key }, method: "POST" });

    return { body: await response.json(), headers: response.headers, status: response.status };
  };

  it("answers a different request under a used key with 422, as the IETF draft has it, linking the documentation", async () => {
    reservation = { outcome: "conflict" };

    const response = await send();
    expect(response).toMatchObject({ body: { code: "idempotency_conflict" }, status: 422 });
    expect(response.headers.get("Link")).toBe(`<${documentationUrl}>; rel="describedby"`);
  });

  it("answers an invalid key with 400, linking the documentation", async () => {
    const response = await send("first, second");
    expect(response).toMatchObject({ body: { code: "invalid_idempotency_key" }, status: 400 });
    expect(response.headers.get("Link")).toBe(`<${documentationUrl}>; rel="describedby"`);
  });

  it("repeats a failure the first request ended with, with its status and body", async () => {
    reservation = {
      outcome: "completed",
      record: {
        expiresAt: new Date("2026-11-22T10:00:00.000Z"),
        responseBody: '{"success":false,"outcomeUnknown":true}',
        responseContentType: "application/json",
        responseStatus: 422,
      },
    };

    const response = await send();
    expect(response).toMatchObject({ body: { outcomeUnknown: true, success: false }, status: 422 });
    expect(response.headers.get("Idempotency-Replayed")).toBe("true");
    expect(response.headers.get("Link")).toBeNull();
  });

  it("answers a repeat that can't run yet, or has no response to repeat, with 409", async () => {
    reservation = { outcome: "in_progress" };
    expect(await send()).toMatchObject({ body: { code: "idempotency_in_progress" }, status: 409 });

    reservation = { outcome: "outcome_unknown" };
    expect(await send()).toMatchObject({ body: { code: "idempotency_outcome_unknown" }, status: 409 });
  });
});
