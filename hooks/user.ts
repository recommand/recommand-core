import { useCallback } from "react";
import { useUserStore } from "@core/lib/user-store";

export function useUser() {
  return useUserStore(x => x.user);
}

export function useActiveTeam() {
  return useUserStore(x => x.activeTeam);
}

export function useTeams() {
  return useUserStore(x => x.teams);
}

export function useTeamPermissions() {
  return useUserStore(x => x.teamPermissions);
}

export function useGlobalPermissions() {
  return useUserStore(x => x.globalPermissions);
}

export function usePermissionChecker() {
  const activeTeam = useUserStore(x => x.activeTeam);
  const teamPermissions = useUserStore(x => x.teamPermissions);
  const globalPermissions = useUserStore(x => x.globalPermissions);
  const user = useUserStore(x => x.user);

  return useCallback((permissionId: string) => {
    // Admins have all permissions
    if (user?.isAdmin) {
      return true;
    }

    if (globalPermissions.includes(permissionId)) {
      return true;
    }

    if (!activeTeam?.id) {
      return false;
    }

    const permissions = teamPermissions[activeTeam.id] ?? [];
    return permissions.includes(permissionId);
  }, [user?.isAdmin, globalPermissions, activeTeam?.id, teamPermissions]);
}

export function useHasPermission(permissionId: string) {
  const hasPermission = usePermissionChecker();
  return hasPermission(permissionId);
}

export function useFeatures() {
  return useUserStore(x => x.features);
}
