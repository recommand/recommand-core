export type PermissionScope = "team" | "global";

export type Permission = {
  id: string;
  name: string;
  description?: string;
  scope?: PermissionScope;
  prerequisiteActorPermissionIds: string[];
  /** What the permission is about, as the dashboard groups permissions, such as `Documents`. */
  resource?: string;
  hasAdminPrerequisite?: boolean;
  isAddedOnTeamCreation?: boolean;
  /** Granted to every user who joins a team, so a new member can do what members could before the permission existed. */
  isAddedOnTeamJoin?: boolean;
}

/** A team permission that guards an existing team route: the creator and every new member get it. */
export const memberPermission = (permission: Pick<Permission, "description" | "id" | "name" | "resource">): Permission => ({
  ...permission,
  scope: "team",
  prerequisiteActorPermissionIds: ["core.team.manage"],
  hasAdminPrerequisite: false,
  isAddedOnTeamCreation: true,
  isAddedOnTeamJoin: true,
});

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

export const getTeamJoinPermissions = (): Permission[] =>
  getRegisteredPermissionsByScope("team").filter((permission) => permission.isAddedOnTeamJoin);

export function getRegisteredPermission(permissionId: string): Permission | null {
  return registeredPermissions[permissionId] ?? null;
}

export function registerPermission(permission: Permission) {
  registeredPermissions[permission.id] = {
    scope: "team",
    hasAdminPrerequisite: permission.scope === "global",
    isAddedOnTeamCreation: false,
    isAddedOnTeamJoin: false,
    ...permission,
  };
}

registerPermission({
  description: "Manage the team and its members",
  hasAdminPrerequisite: false,
  id: "core.team.manage",
  isAddedOnTeamCreation: true,
  name: "Manage Team",
  prerequisiteActorPermissionIds: ["core.team.manage"],
  resource: "Team",
  scope: "team",
});

// Every member could use these routes before they required a permission, so every member gets them
[
  { description: "Delete API keys, which stops every client that uses them", id: "core.api_keys.delete", name: "Delete API keys", resource: "API keys" },
  { description: "See API keys and the permissions they hold", id: "core.api_keys.read", name: "Read API keys", resource: "API keys" },
  { description: "Create API keys and change their permissions", id: "core.api_keys.write", name: "Manage API keys", resource: "API keys" },
  { description: "See who is in the team, with their email addresses", id: "core.members.read", name: "Read members", resource: "Members" },
  { description: "Delete automation rules, so they no longer react to events", id: "core.rules.delete", name: "Delete rules", resource: "Rules" },
  { description: "See automation rules, their deliveries and the events they can react to", id: "core.rules.read", name: "Read rules", resource: "Rules" },
  { description: "Create and change automation rules, and retry their deliveries", id: "core.rules.write", name: "Manage rules", resource: "Rules" },
].forEach((permission) => registerPermission(memberPermission(permission)));
