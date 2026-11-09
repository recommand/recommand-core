import { beforeEach, describe, expect, test } from "bun:test";
import { pool, useTestDatabase } from "./harness";

const { findClient } = await import("../../data/oauth-clients");

const clientId = "https://client.example/oauth/metadata.json";
const document = {
  client_id: clientId,
  client_name: "Example Client",
  grant_types: ["authorization_code", "refresh_token"],
  redirect_uris: ["http://127.0.0.1/callback"],
  token_endpoint_auth_method: "none",
};
const lookup = async () => [{ address: "93.184.215.14", family: 4 }];
const serve = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const down = async () => {
  throw new Error("connection refused");
};
const ageStoredCopy = () => pool.query("UPDATE oauth_clients SET metadata_fetched_at = now() - interval '2 hours'");

useTestDatabase();
beforeEach(async () => {
  await pool.query("TRUNCATE oauth_clients CASCADE");
});

describe("a client identified by a metadata document", () => {
  test("is read again once the stored copy is an hour old", async () => {
    expect((await findClient(clientId, { fetch: serve(document), lookup }))?.name).toBe("Example Client");
    await ageStoredCopy();
    const renamed = await findClient(clientId, { fetch: serve({ ...document, client_name: "Renamed" }), lookup });
    expect(renamed?.name).toBe("Renamed");
  });

  test("keeps working from the stored copy while its host is down", async () => {
    await findClient(clientId, { fetch: serve(document), lookup });
    for (const fetch of [down, serve({}, 503)]) {
      await ageStoredCopy();
      expect((await findClient(clientId, { fetch, lookup }))?.name).toBe("Example Client");
    }
    // Checked just now, so the next request doesn't wait for the host again
    expect((await findClient(clientId, { fetch: down, lookup }))?.name).toBe("Example Client");
  });

  test("is refused once its document is gone or invalid, or was never read", async () => {
    await findClient(clientId, { fetch: serve(document), lookup });
    await ageStoredCopy();
    await expect(findClient(clientId, { fetch: serve(document, 404), lookup })).rejects.toThrow("answered 404");
    await expect(findClient(clientId, { fetch: serve({ ...document, redirect_uris: [] }), lookup })).rejects.toThrow("invalid");

    await pool.query("TRUNCATE oauth_clients CASCADE");
    await expect(findClient(clientId, { fetch: down, lookup })).rejects.toThrow("could not be fetched");
  });
});
