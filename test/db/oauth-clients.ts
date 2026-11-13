import { beforeEach, describe, expect, test } from "bun:test";
import { pool, useTestDatabase } from "./harness";

const { deleteExpiredAuthorizationCodes } = await import("../../data/oauth-authorization-codes");
const { deleteUnusedClients, findClient } = await import("../../data/oauth-clients");

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
  await pool.query("TRUNCATE oauth_clients, users CASCADE");
});

describe("a client identified by a metadata document", () => {
  test("is used as long as its document allows", async () => {
    const cached = async () =>
      new Response(JSON.stringify(document), { headers: { "Cache-Control": "max-age=86400" } });
    await findClient(clientId, { fetch: cached, lookup });
    await ageStoredCopy();
    // Not fetched again, so the renamed document isn't seen yet
    expect((await findClient(clientId, { fetch: serve({ ...document, client_name: "Renamed" }), lookup }))?.name).toBe("Example Client");
    const { rows } = await pool.query("SELECT metadata_max_age FROM oauth_clients");
    expect(rows).toEqual([{ metadata_max_age: 86_400 }]);
  });

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

test("clients nobody uses are deleted after 30 days, the others stay", async () => {
  const client = (id: string, age: string, { authorized = false, disabled = false, document = false } = {}) =>
    pool.query(
      `INSERT INTO oauth_clients (id, kind, grant_types, redirect_uris, token_endpoint_auth_method, authorized_at, disabled_at, metadata_fetched_at, updated_at)
       VALUES ($1, 'dynamic', '{authorization_code}', '{https://app.example.com/callback}', 'none', $2, $3, $4, now() - $5::interval)`,
      [id, authorized ? new Date() : null, disabled ? new Date() : null, document ? new Date() : null, age]
    );
  await pool.query("INSERT INTO users (id, email, password_hash) VALUES ('member', 'member@example.com', 'unused')");
  await client("dcr_unused", "31 days");
  await client("dcr_recent", "29 days");
  await client("dcr_disabled", "31 days", { disabled: true });
  await client("dcr_authorized", "31 days", { authorized: true });
  await client("https://client.example/oauth/metadata.json", "31 days", { authorized: true, document: true });
  await client("dcr_stale", "31 days");
  await client("dcr_granted", "31 days");
  await client("dcr_authorizing", "31 days");
  await pool.query("INSERT INTO oauth_grants (id, principal_type, client_id, user_id) VALUES ('grt_kept', 'user', 'dcr_granted', 'member')");
  await pool.query(
    `INSERT INTO oauth_authorization_codes (code_hash, code_challenge, expires_at, permission_ids, redirect_uri, resources, team_ids, client_id, user_id)
     VALUES ('hash', 'challenge', now() + interval '1 minute', '{}', 'https://app.example.com/callback', '{}', '{}', 'dcr_authorizing', 'member'),
       ('stale', 'challenge', now() - interval '2 days', '{}', 'https://app.example.com/callback', '{}', '{}', 'dcr_stale', 'member')`
  );

  await deleteExpiredAuthorizationCodes();
  expect(await deleteUnusedClients()).toBe(3);
  const { rows } = await pool.query("SELECT id FROM oauth_clients ORDER BY id");
  expect(rows.map((row) => row.id)).toEqual(["dcr_authorized", "dcr_authorizing", "dcr_disabled", "dcr_granted", "dcr_recent"]);
});

