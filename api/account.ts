import { zodValidator } from "@recommand/lib/zod-validator";
import { z } from "zod";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { db } from "@recommand/db";
import { users } from "@core/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { requireAuth } from "@core/lib/auth-middleware";
import { withTranslation } from "@core/lib/translation-middleware";
import { createSession } from "@core/lib/session";

const server = new Server();

const _updateProfile = server.put(
  "/account/profile",
  requireAuth(),
  withTranslation(),
  zodValidator(
    "json",
    z.object({
      language: z.string().min(1).max(10),
    })
  ),
  async (c) => {
    const t = c.get("t");
    try {
      const userId = c.get("user")?.id;
      if (!userId) {
        return c.json(actionFailure(t`Unauthorized`), 401);
      }

      const { language } = c.req.valid("json");

      await db
        .update(users)
        .set({ language })
        .where(eq(users.id, userId));

      // Refresh session with updated language
      const user = await db
        .select({ id: users.id, isAdmin: users.isAdmin, language: users.language })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user[0]) {
        await createSession(c, user[0]);
      }

      return c.json(actionSuccess());
    } catch (e) {
      console.error(e);
      return c.json(actionFailure(t`Internal server error`), 500);
    }
  }
);

const _changePassword = server.put(
  "/account/password",
  requireAuth(),
  withTranslation(),
  zodValidator(
    "json",
    z.object({
      currentPassword: z.string(),
      newPassword: z
        .string()
        .min(8, { message: "Password must be at least 8 characters" }),
    })
  ),
  async (c) => {
    const t = c.get("t");
    try {
      const userId = c.get("user")?.id;
      if (!userId) {
        return c.json(actionFailure(t`Unauthorized`), 401);
      }

      const { currentPassword, newPassword } = c.req.valid("json");

      const user = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user[0]) {
        return c.json(actionFailure(t`User not found`), 404);
      }

      const passwordMatch = await bcrypt.compare(currentPassword, user[0].passwordHash);
      if (!passwordMatch) {
        return c.json(actionFailure(t`Current password is incorrect`), 400);
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId));

      return c.json(actionSuccess());
    } catch (e) {
      console.error(e);
      return c.json(actionFailure(t`Internal server error`), 500);
    }
  }
);

export type Account = typeof _updateProfile | typeof _changePassword;

export default server;
