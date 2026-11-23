import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

// The app needs these to load; these requests fail before either is used
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.JWT_SECRET ??= "unused";
const { default: oauth } = await import("../api/oauth");

const app = new Hono();
app.route("/", oauth);

const requestToken = async (fields: Record<string, string>) => {
  const response = await app.request("/oauth2/token", { body: new URLSearchParams(fields), method: "POST" });
  return { body: (await response.json()) as Record<string, unknown>, response };
};

describe("the JWT bearer token endpoint", () => {
  test("adds an OAuth error code to the failures it already reports", async () => {
    const missing = await requestToken({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer" });
    expect(missing.response.status).toBe(400);
    expect(missing.body).toMatchObject({ error: "invalid_request", success: false });
    expect(missing.body.errors).toBeDefined();

    const unverified = await requestToken({ assertion: "not-a-jwt", grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer" });
    expect(unverified.response.status).toBe(400);
    expect(unverified.body).toMatchObject({ error: "invalid_grant", success: false });
    expect(unverified.body.errors).toBeDefined();
  });

  test("names a grant type it doesn't support", async () => {
    const { body } = await requestToken({ assertion: "x", grant_type: "client_credentials" });
    expect(body).toMatchObject({ error: "unsupported_grant_type", success: false });
  });

  test("keeps its responses out of caches", async () => {
    const { response } = await requestToken({ assertion: "not-a-jwt", grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });
});
