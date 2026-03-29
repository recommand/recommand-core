import { zodValidator } from "@recommand/lib/zod-validator";
import { z } from "zod";
import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { getMinimalTeamMembers, addTeamMember, removeTeamMember, getUserByEmail, isTeamMember } from "@core/data/team-members";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { withTranslation } from "@core/lib/translation-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { createUserForInvitation } from "@core/data/users";
import { sendEmail } from "@core/lib/email";
import { getEmailTemplate } from "@core/emails";
import { createServerT } from "@core/lib/translations-server";
import { randomBytes } from "crypto";
import { db } from "@recommand/db";
import { users } from "@core/db/schema";
import { eq, sql } from "drizzle-orm";

const server = new Server();

// Generate cryptographically secure random token
function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

const _getTeamMembers = server.get(
  "/auth/teams/:teamId/members",
  requireTeamAccess(),
  withTranslation(),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  async (c) => {
    const t = c.get("t");
    try {
      const members = await getMinimalTeamMembers(c.get("team").id);
      return c.json(
        actionSuccess({
          members,
        })
      );
    } catch (error) {
      console.error(error);
      return c.json(actionFailure(t`Internal server error`), 500);
    }
  }
);

const _addTeamMember = server.post(
  "/auth/teams/:teamId/members",
  requireTeamAccess(),
  requirePermission("core.team.manage"),
  withTranslation(),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
    })
  ),
  zodValidator(
    "json",
    z.object({
      email: z.string().email(),
    })
  ),
  async (c) => {
    const t = c.get("t");
    try {
      const reqJson = c.req.valid("json");
      const teamId = c.get("team").id;
      const team = c.get("team");

      let user: { id: string; email: string; emailVerified: boolean } | null = null;
      let isNewUser = false;

      user = await getUserByEmail(reqJson.email);
      if (!user) {
        // Create user for invitation
        user = await createUserForInvitation(reqJson.email);
        isNewUser = true;
      }

      // Check if user is already a team member
      const isAlreadyMember = await isTeamMember(teamId, user.id);
      if (isAlreadyMember) {
        return c.json(actionFailure(t`User is already a member of this team`), 400);
      }

      // Add user to team
      const result = await addTeamMember(teamId, user.id);

      // If this is a new user or existing unverified user, send invitation email
      if (isNewUser || !user.emailVerified) {
        // Generate reset token for setting password
        const resetToken = generateSecureToken();

        // Store reset token in database with expiration (7 days for invitations)
        await db
          .update(users)
          .set({
            resetToken,
            resetTokenExpires: sql`CURRENT_TIMESTAMP + INTERVAL '7 days'`,
          })
          .where(eq(users.id, user.id));

        // Send invitation email in the inviter's language
        const emailT = await createServerT(c.get("language"));
        const resetLink = `${process.env.BASE_URL}/reset-password/${resetToken}`;
        const invitationEmail = await getEmailTemplate("team-invitation-email");
        const emailProps = { firstName: null, teamName: team.name, resetPasswordLink: resetLink, t: emailT };
        await sendEmail({
          to: user.email,
          subject: invitationEmail.subject(emailProps),
          email: invitationEmail.render(emailProps),
        });
      }

      return c.json(actionSuccess({
        teamMember: result[0],
        message: isNewUser ? t`Invitation sent successfully` : t`User added to team`
      }));
    } catch (error) {
      console.error(error);
      return c.json(actionFailure(t`Internal server error`), 500);
    }
  }
);

const _removeTeamMember = server.delete(
  "/auth/teams/:teamId/members/:userId",
  requireTeamAccess(),
  requirePermission("core.team.manage"),
  zodValidator(
    "param",
    z.object({
      teamId: z.string(),
      userId: z.string(),
    })
  ),
  async (c) => {
    try {
      await removeTeamMember(c.get("team").id, c.req.param("userId"));
      return c.json(actionSuccess());
    } catch (error) {
      return c.json(actionFailure(error as Error), 500);
    }
  }
);

export type TeamMembers =
  | typeof _getTeamMembers
  | typeof _addTeamMember
  | typeof _removeTeamMember;

export default server;