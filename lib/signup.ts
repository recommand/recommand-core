/**
 * Public signup can be switched off with the DISABLE_PUBLIC_SIGNUP env flag.
 * When disabled, new users can only join through team invitations sent by
 * existing users (see api/team-members.ts).
 */
export function isPublicSignupEnabled(): boolean {
  const value = process.env.DISABLE_PUBLIC_SIGNUP?.trim().toLowerCase();
  return !(value === "true" || value === "1" || value === "yes");
}
