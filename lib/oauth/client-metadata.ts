import { z } from "zod";
import { isAllowedRedirectUri } from "./redirect-uri";

const isHttpsUrl = (value: string) => URL.canParse(value) && new URL(value).protocol === "https:";

/**
 * The client metadata this server reads (RFC 7591, section 2); other fields are
 * ignored. Only clients without a secret are supported, so they authenticate at
 * the token endpoint with `none`: a client must list it among the methods it
 * supports, or name no method at all (Client ID Metadata Document,
 * draft-ietf-oauth-client-id-metadata-document-03, section 5).
 *
 * @see https://www.rfc-editor.org/rfc/rfc7591#section-2
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-5
 */
export const clientMetadataSchema = z
  .object({
    client_name: z.string().trim().min(1).max(200).optional(),
    client_uri: z.string().refine(isHttpsUrl, "Must be an https URL").optional(),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .min(1)
      .refine((grantTypes) => grantTypes.includes("authorization_code"), "Must include authorization_code")
      .default(["authorization_code"]),
    logo_uri: z.string().refine(isHttpsUrl, "Must be an https URL").optional(),
    redirect_uris: z
      .array(z.string().refine(isAllowedRedirectUri, "Must be an https URI, or http on a loopback address"))
      .min(1)
      .max(20),
    response_types: z.array(z.literal("code")).min(1).default(["code"]),
    token_endpoint_auth_method: z.string().optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).min(1).optional(),
  })
  .superRefine(({ token_endpoint_auth_method: method, token_endpoint_auth_methods_supported: supported }, context) => {
    if (method !== undefined && supported !== undefined && !supported.includes(method)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be one of token_endpoint_auth_methods_supported",
        path: ["token_endpoint_auth_method"],
      });
    }

    // The list replaces the single method; without either, the client has no secret, rather
    // than RFC 7591's default of `client_secret_basic`
    const methods = supported ?? [method ?? "none"];
    if (!methods.includes("none")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must include none",
        path: [supported === undefined ? "token_endpoint_auth_method" : "token_endpoint_auth_methods_supported"],
      });
    }
  })
  .transform(({ token_endpoint_auth_methods_supported: _supported, ...metadata }) => ({
    ...metadata,
    token_endpoint_auth_method: "none" as const,
  }));

export type ClientMetadata = z.infer<typeof clientMetadataSchema>;
