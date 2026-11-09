import { describe, expect, test } from "bun:test";
import type { OAuthClient } from "../data/oauth-clients";
import { buildRedirect, parseAuthorizationRequest } from "../lib/oauth/authorization-request";
import { ClientMetadataError } from "../lib/oauth/client-metadata";
import { getDelegablePermissions, registerPermission } from "../lib/permissions";

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ delegation: "opt_in", id: "test.write", name: "Write", prerequisiteActorPermissionIds: [] });
registerPermission({ id: "test.undelegated", name: "Undelegated", prerequisiteActorPermissionIds: [] });

const client: OAuthClient = {
  allowedPermissions: null,
  clientUri: null,
  createdAt: new Date(),
  disabledAt: null,
  grantTypes: ["authorization_code"],
  id: "https://app.example.com/client.json",
  kind: "dynamic",
  logoUri: null,
  metadataFetchedAt: new Date(),
  name: "Example",
  redirectUris: ["https://app.example.com/callback", "http://127.0.0.1:8080/callback"],
  tokenEndpointAuthMethod: "none",
  updatedAt: new Date(),
};

const valid = {
  client_id: client.id,
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  redirect_uri: "https://app.example.com/callback",
  response_type: "code",
  state: "xyz",
};

const parse = (parameters: Record<string, unknown>, found: OAuthClient | null = client) =>
  parseAuthorizationRequest(parameters, async () => found);

describe("an authorization request", () => {
  test("is shown to the user, not redirected, without a client or redirect URI to trust", async () => {
    expect(await parse({ ...valid, client_id: undefined })).toMatchObject({ type: "invalid" });
    expect(await parse(valid, null)).toMatchObject({ type: "invalid" });
    expect(await parse({ ...valid, redirect_uri: "https://evil.example.com/callback" })).toMatchObject({ type: "invalid" });
    expect(await parse({ ...valid, redirect_uri: undefined })).toMatchObject({ type: "invalid" });
    expect(
      await parseAuthorizationRequest(valid, async () => {
        throw new ClientMetadataError("The client metadata document answered 404");
      })
    ).toEqual({ description: "The client metadata document answered 404", type: "invalid" });
  });

  test("uses the only registered redirect URI, and any loopback port", async () => {
    const single = { ...client, redirectUris: ["https://app.example.com/callback"] };
    expect(await parse({ ...valid, redirect_uri: undefined }, single)).toMatchObject({
      request: { redirectUri: "https://app.example.com/callback" },
    });
    expect(await parse({ ...valid, redirect_uri: "http://127.0.0.1:51234/callback" })).toMatchObject({ type: "valid" });
  });

  test("sends other errors back to the client with its state", async () => {
    expect(await parse({ ...valid, response_type: "token" })).toEqual({
      description: "Only the code response type is supported",
      error: "unsupported_response_type",
      redirectUri: valid.redirect_uri,
      state: "xyz",
      type: "redirect",
    });
    expect(await parse({ ...valid, code_challenge_method: "plain" })).toMatchObject({ error: "invalid_request" });
    expect(await parse({ ...valid, code_challenge: "too-short" })).toMatchObject({ error: "invalid_request" });
    expect(await parse({ ...valid, resource: ["not a uri"] })).toMatchObject({ error: "invalid_target" });
    expect(await parse({ ...valid, resource: ["https://api.example.com/#part"] })).toMatchObject({ error: "invalid_target" });
  });

  test("offers everything the client can be granted when there is no scope", async () => {
    const delegable = getDelegablePermissions().map((permission) => permission.id);
    expect(delegable).toContain("test.read");
    expect(delegable).toContain("test.write");
    expect(delegable).not.toContain("test.undelegated");
    expect(await parse(valid)).toMatchObject({ request: { permissionIds: delegable } });
    expect(await parse({ ...valid, scope: "openid profile" })).toMatchObject({ request: { permissionIds: delegable } });
  });

  test("keeps only the permissions this client can be granted", async () => {
    expect(await parse({ ...valid, scope: "test.read test.write test.undelegated test.unknown openid" })).toMatchObject({
      request: { permissionIds: ["test.read", "test.write"] },
    });
    expect(await parse({ ...valid, scope: "test.read" }, { ...client, allowedPermissions: ["test.write"] })).toMatchObject({
      error: "invalid_scope",
    });
  });
});

test("a redirect keeps the redirect URI's own query and leaves out empty values", () => {
  expect(buildRedirect("https://app.example.com/callback?tenant=1", { code: "abc", state: null })).toBe(
    "https://app.example.com/callback?tenant=1&code=abc"
  );
});
