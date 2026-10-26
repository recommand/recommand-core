import { z } from "zod";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { createJwtApiKey } from "@core/data/api-keys";
import { jwtVerifyClientSignedJWT } from "@core/data/oauth";
import { addSeconds, fromUnixTime, differenceInSeconds } from "date-fns";
import { zodValidator } from "@recommand/lib/zod-validator";
import { describeRoute } from "hono-openapi";

const server = new Server();

const tokenSchema = z.object({
    grant_type: z.enum(["urn:ietf:params:oauth:grant-type:jwt-bearer"]),
    assertion: z.string().min(1),
})

const _token = server.post(
    "/oauth2/token",
    describeRoute({ hide: true, security: [] }),
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
