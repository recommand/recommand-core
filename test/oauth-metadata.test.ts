import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import oauthMetadata from "../api/oauth/metadata";
import { getDelegablePermissions, registerPermission } from "../lib/permissions";

process.env.BASE_URL = "https://recommand.example.com";

registerPermission({ delegation: "all", id: "test.read", name: "Read", prerequisiteActorPermissionIds: [] });
registerPermission({ id: "test.undelegated", name: "Undelegated", prerequisiteActorPermissionIds: [] });

test("scopes include what clients can be granted, opt-in ones too, and nothing else", () => {
  const scopes = getDelegablePermissions().map((permission) => permission.id);
  expect(scopes).toContain("test.read");
  expect(scopes).toContain("core.rules.write");
  expect(scopes).not.toContain("test.undelegated");
  expect(scopes).not.toContain("core.api_keys.write");
  expect(scopes).not.toContain("core.team.manage");
});

const app = new Hono();
app.route("/", oauthMetadata);

const read = async (path: string) => (await (await app.request(path)).json()) as Record<string, unknown>;

describe("OAuth discovery", () => {
  test("describes the authorization server and its endpoints", async () => {
    expect(await read("/.well-known/oauth-authorization-server")).toEqual({
      authorization_endpoint: "https://recommand.example.com/oauth/authorize",
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "urn:ietf:params:oauth:grant-type:jwt-bearer", "refresh_token"],
      issuer: "https://recommand.example.com",
      jwks_uri: "https://recommand.example.com/.well-known/jwks.json",
      registration_endpoint: "https://recommand.example.com/api/core/oauth/register",
      response_types_supported: ["code"],
      revocation_endpoint: "https://recommand.example.com/api/core/oauth/revoke",
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: getDelegablePermissions().map((permission) => permission.id),
      token_endpoint: "https://recommand.example.com/api/core/oauth/token",
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  test("names the API as a resource and its authorization server", async () => {
    expect(await read("/.well-known/oauth-protected-resource/api")).toEqual({
      authorization_servers: ["https://recommand.example.com"],
      bearer_methods_supported: ["header"],
      resource: "https://recommand.example.com/api",
      scopes_supported: getDelegablePermissions().map((permission) => permission.id),
    });
  });
});
