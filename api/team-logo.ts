import { actionFailure, actionSuccess } from "@recommand/lib/utils";
import { Server } from "@recommand/lib/api";
import { updateTeam, resolveTeamLogoUrl } from "@core/data/teams";
import { uploadFile, deleteFile, isTeamLogoEnabled } from "@core/lib/s3";
import { requireTeamAccess } from "@core/lib/auth-middleware";
import { requirePermission } from "@core/lib/permissions/permission-middleware";
import { withTranslation } from "@core/lib/translation-middleware";
import { compressImage } from "@core/lib/image";

const server = new Server();

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

const uploadTeamLogo = server.post(
  "/auth/teams/:teamId/logo",
  requireTeamAccess(),
  requirePermission("core.team.manage"),
  withTranslation(),
  async (c) => {
    const t = c.get("t");
    if (!isTeamLogoEnabled()) {
      return c.json(actionFailure(t`File storage is not enabled`), 400);
    }
    try {
      const team = c.get("team");
      const body = await c.req.parseBody();
      const file = body["logo"];

      if (!file || !(file instanceof File)) {
        return c.json(actionFailure(t`No logo file provided`), 400);
      }

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return c.json(actionFailure(t`Invalid file type. Allowed: PNG, JPEG, WebP, SVG`), 400);
      }

      if (file.size > MAX_LOGO_SIZE) {
        return c.json(actionFailure(t`File too large. Maximum size is 2MB`), 400);
      }

      // Delete old logo if exists
      if (team.logoUrl) {
        try { await deleteFile(team.logoUrl); } catch {}
      }

      let uploadData: ArrayBuffer | Buffer = await file.arrayBuffer();
      let uploadType = file.type;
      let ext = file.name.split(".").pop() || "png";

      // Compress raster images to WebP, pass SVG through as-is
      if (file.type !== "image/svg+xml") {
        const compressed = await compressImage(new Uint8Array(uploadData));
        uploadData = compressed.data;
        uploadType = compressed.type;
        ext = compressed.ext;
      }

      const s3Key = `teams/${team.id}/logo.${ext}`;
      await uploadFile(s3Key, uploadData, { type: uploadType });
      const updatedTeam = await updateTeam(team.id, { logoUrl: s3Key });

      return c.json(actionSuccess({ data: resolveTeamLogoUrl(updatedTeam) }));
    } catch (e) {
      console.error(e);
      return c.json(actionFailure(t`Internal server error`), 500);
    }
  }
);

const deleteTeamLogo = server.delete(
  "/auth/teams/:teamId/logo",
  requireTeamAccess(),
  requirePermission("core.team.manage"),
  withTranslation(),
  async (c) => {
    const t = c.get("t");
    if (!isTeamLogoEnabled()) {
      return c.json(actionFailure(t`File storage is not enabled`), 400);
    }
    try {
      const team = c.get("team");

      if (team.logoUrl) {
        try { await deleteFile(team.logoUrl); } catch {}
      }

      const updatedTeam = await updateTeam(team.id, { logoUrl: null });
      return c.json(actionSuccess({ data: resolveTeamLogoUrl(updatedTeam) }));
    } catch (e) {
      console.error(e);
      return c.json(actionFailure(t`Internal server error`), 500);
    }
  }
);

export type TeamLogo =
  | typeof uploadTeamLogo
  | typeof deleteTeamLogo;

export default server;
