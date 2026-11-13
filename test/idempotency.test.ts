import { describe, expect, it, mock } from "bun:test";

// Parsing and fingerprinting don't touch the database the middleware's module loads
mock.module("@recommand/db", () => ({ db: {} }));
const { fingerprintRequest, parseIdempotencyKey } = await import("../lib/idempotency");

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
