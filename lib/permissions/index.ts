export type PermissionScope = "team" | "global";

export type Permission = {
  id: string;
  name: string;
  description?: string;
  scope?: PermissionScope;
  prerequisiteActorPermissionIds: string[];
  hasAdminPrerequisite?: boolean;
  isAddedOnTeamCreation?: boolean;
}

const CORE_PERMISSIONS: Permission[] = [
  {
    id: "core.team.manage",
    name: "Manage Team",
    description: "Manage the team and its members",
    scope: "team",
    prerequisiteActorPermissionIds: ["core.team.manage"],
    hasAdminPrerequisite: false,
    isAddedOnTeamCreation: true,
  },
  {
    id: "core.installations.manage",
    name: "Manage Installations",
    description: "List, create, and delete installations and installation tokens",
    scope: "team",
    prerequisiteActorPermissionIds: ["core.team.manage"],
    hasAdminPrerequisite: false,
    isAddedOnTeamCreation: true,
  },
  {
    id: "core.events.read",
    name: "Read Events",
    description: "Read the team's event log and manage event cursors",
    scope: "team",
    prerequisiteActorPermissionIds: ["core.installations.manage"],
    hasAdminPrerequisite: false,
    isAddedOnTeamCreation: false,
  },
];

export const DEFAULT_INSTALLATION_PERMISSION_IDS = [
  "core.events.read",
];

const registeredPermissions: Record<string, Permission> = {};

export function getRegisteredPermissions(): Permission[] {
  return Object.values(registeredPermissions);
}

export function getRegisteredPermissionsByScope(scope: PermissionScope): Permission[] {
  return Object.values(registeredPermissions).filter((permission) => permission.scope === scope);
}

export function getTeamCreationPermissions(): Permission[] {
  return getRegisteredPermissionsByScope("team").filter((permission) => permission.isAddedOnTeamCreation);
}

export function getRegisteredPermission(permissionId: string): Permission | null {
  return registeredPermissions[permissionId] ?? null;
}

export function registerPermission(permission: Permission) {
  registeredPermissions[permission.id] = {
    scope: "team",
    hasAdminPrerequisite: permission.scope === "global",
    isAddedOnTeamCreation: false,
    ...permission,
  };
}

for (const permission of CORE_PERMISSIONS) {
  registerPermission(permission);
}
