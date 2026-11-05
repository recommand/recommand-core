import { z } from "zod";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { createJwtApiKey } from "@core/data/api-keys";
import { jwtVerifyClientSignedJWT } from "@core/data/oauth";
import { addSeconds, fromUnixTime, differenceInSeconds } from "date-fns";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";
import { createMiddleware } from "hono/factory";

const server = new Server();

const JWT_BEARER_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

const tokenSchema = z.object({
    grant_type: z.enum([JWT_BEARER_GRANT_TYPE]),
    assertion: z.string().min(1),
})

/**
 * Makes the token responses follow RFC 6749, section 5, alongside the fields
 * they already have: they're never cached, and a failure also carries an
 * OAuth `error` code and `error_description`.
 */
const standardTokenResponses = createMiddleware(async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "no-store");
    c.res.headers.set("Pragma", "no-cache");
    if (c.res.status !== 400) {
        return;
    }

    const body = await c.res.clone().json();
    const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const [error, description] =
        form.grant_type !== undefined && form.grant_type !== JWT_BEARER_GRANT_TYPE
            ? ["unsupported_grant_type", `Only the ${JWT_BEARER_GRANT_TYPE} grant type is supported`]
            : body.invalidInputDetails
                ? ["invalid_request", "The request needs a grant_type and an assertion"]
                : ["invalid_grant", "The assertion could not be verified"];
    const headers = new Headers(c.res.headers);
    headers.delete("Content-Length");
    c.res = new Response(JSON.stringify({ ...body, error, error_description: description }), { headers, status: 400 });
});

const _token = server.post(
    "/oauth2/token",
    describeRoute({ hide: true, security: [] }),
    standardTokenResponses,
    zodValidator("form", tokenSchema),
    async (c) => {
        try{
            const formData = c.req.valid("form");

            // Construct the expected token endpoint URL for audience validation
            const tokenEndpointUrl = `${process.env.BASE_URL}/api/core/oauth2/token`;

            // Validate client assertion (includes audience validation per RFC 7523)
            const verifiedJwt = await jwtVerifyClientSignedJWT(formData.assertion, tokenEndpointUrl);
            if(!verifiedJwt){
                return c.json(actionFailure("Could not verify client signed JWT."), 400);
            }

            const expirationDate = verifiedJwt.payload.exp ? fromUnixTime(verifiedJwt.payload.exp) : addSeconds(new Date(), 60 * 60); // Default: 1 hour

            // Create api key
            const apiKey = await createJwtApiKey({
                user: {id: verifiedJwt.userId, isAdmin: verifiedJwt.isAdmin},
                teamId: verifiedJwt.teamId,
                expirationDate,
                name: "OAuth2 JWT Bearer Token With Assertion",
            })

            const expiresIn = differenceInSeconds(expirationDate, new Date());

            return c.json(actionSuccess({
                access_token: apiKey.jwt,
                token_type: "Bearer",
                expires_in: expiresIn,
                id: apiKey.id,
            }))
        }catch(error){
            console.error(error);
            return c.json(actionFailure("Error while generating token"), 500);
        }
    }
)

export type OAuth = typeof _token;

export default server;
