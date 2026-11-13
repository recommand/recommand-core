import { zodResolver } from "@recommand/lib/zod-validator";
import z from "zod";
import "zod-openapi/extend";

/** The error body of the OAuth endpoints (RFC 6749, section 5.2), which OAuth clients read. */
export const oauthErrorSchema = z
  .object({
    error: z.string().openapi({ description: "The OAuth error code, such as `invalid_request`." }),
    error_description: z.string().openapi({ description: "What went wrong, for the client's developer." }),
  })
  .openapi({ ref: "OAuthError" });

/**
 * A response whose body is `schema` as OAuth defines it, without the
 * `success` envelope of the other routes, or a response without a body.
 */
export const describeOAuthResponse = (status: number, description: string, schema?: z.ZodTypeAny) => ({
  [status]: {
    description,
    ...(schema ? { content: { "application/json": { schema: zodResolver(schema) } } } : {}),
  },
});
