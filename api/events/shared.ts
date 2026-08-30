import {
  type AuthenticatedTeamContext,
  type AuthenticatedUserContext,
} from "@core/lib/auth-middleware";
import { type Context } from "@recommand/lib/api";
import { z } from "zod";

export const listEventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).optional().default(0),
  streamId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const cursorBodySchema = z.object({
  lastSeq: z.number().int().min(0),
});

export function resolveConsumerId(
  c: Context<AuthenticatedUserContext & AuthenticatedTeamContext>
): string | { error: string; status: 400 } {
  if (c.var.installation) {
    return c.var.installation.id;
  }

  return { error: "consumerId is required", status: 400 };
}
