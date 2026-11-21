import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { pool, useTestDatabase } from "./harness";

const { default: oauthRegister } = await import("../../api/oauth/register");

const app = new Hono();
app.route("/", oauthRegister);

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE oauth_clients, audit_events CASCADE");
});

const register = (body: unknown) => app.request("/oauth/register", {
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});

describe("registering a client", () => {
  test("stores it under an ID the server picks", async () => {
    const response = await register({
      client_id: "https://evil.example.com/client.json",
      client_name: "Example CLI",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["http://127.0.0.1/callback"],
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body).toMatchObject({
      client_name: "Example CLI",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["http://127.0.0.1/callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    expect(body.client_id).toStartWith("dcr_");
    expect(body.client_secret).toBeUndefined();

    const { rows } = await pool.query("SELECT id, kind FROM oauth_clients");
    expect(rows).toEqual([{ id: body.client_id, kind: "dynamic" }]);
  });

  test("refuses redirect URIs and authentication it doesn't support", async () => {
    const insecure = await register({ redirect_uris: ["http://app.example.com/callback"] });
    expect(insecure.status).toBe(400);
    expect(await insecure.json()).toMatchObject({ error: "invalid_redirect_uri" });

    const secret = await register({
      redirect_uris: ["https://app.example.com/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    });
    expect(secret.status).toBe(400);
    expect(await secret.json()).toMatchObject({ error: "invalid_client_metadata" });

    const empty = await app.request("/oauth/register", { body: "not json", method: "POST" });
    expect(empty.status).toBe(400);
    expect((await pool.query("SELECT id FROM oauth_clients")).rows).toEqual([]);
  });
});
