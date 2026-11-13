import { teamMembers, teams, users } from "@core/db/schema";
import { db } from "@recommand/db";
import { and, eq } from "drizzle-orm";
import { jwtVerify, type JWTPayload, decodeJwt, createLocalJWKSet } from "jose";

export async function jwtVerifyClientSignedJWT(jwt: string, expectedAudience: string | string[]): Promise<{userId: string, isAdmin: boolean, teamId: string, payload: JWTPayload} | false> {

    try{
        // Extract the teamId and userId
        const { iss, sub, team_id: teamId, user_id: userId } = decodeJwt<JWTPayload & { team_id: string, user_id: string }>(jwt);
        if(!teamId || !userId || !iss || !sub || iss !== teamId || sub !== teamId){
            return false;
        }
        
        // Load user info and public key from db
        const res = await db
            .select({
                isAdmin: users.isAdmin,
                clientAssertionJwks: teams.clientAssertionJwks,
            })
            .from(teams)
            .innerJoin(teamMembers, and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
            .innerJoin(users, eq(users.id, userId))
            .where(and(eq(teams.id, teamId)))
            .then(x => x[0]);
        if(!res || !res.clientAssertionJwks){
            return false;
        }
        const isAdmin = res.isAdmin;
        const jwks = JSON.parse(res.clientAssertionJwks);
        const jwksSet = createLocalJWKSet(jwks);

        // Verify and extract JWT
        const { payload } = await jwtVerify(jwt, jwksSet, {
            algorithms: ["RS256"],
            audience: expectedAudience,
        });

        return { userId, isAdmin, teamId, payload };
    }catch(error){
        console.error(error);
        return false;
    }
}