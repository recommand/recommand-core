import { PageTemplate } from "@core/components/page-template";
import { rc } from "@recommand/lib/client";
import type { Permissions } from "@core/api/permissions";
import type { TeamMembers } from "@core/api/team-members";
import { useEffect, useState, useCallback } from "react";
import { toast } from "@core/components/ui/sonner";
import { stringifyActionFailure } from "@recommand/lib/utils";
import { useActiveTeam } from "@core/hooks/user";
import { Loader2, ArrowLeft } from "lucide-react";
import { useParams, Link } from "react-router";
import { Checkbox } from "@core/components/ui/checkbox";
import { Label } from "@core/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@core/components/ui/card";
import { useTranslation } from "@core/hooks/use-translation";

const permissionsClient = rc<Permissions>("core");
const teamMembersClient = rc<TeamMembers>("core");

type PermissionWithGrantable = {
  id: string;
  name: string;
  description?: string;
};

type UserPermission = {
  userId: string;
  teamId: string;
  permissionId: string;
  grantedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function UserPermissionsPage() {
  const { userId } = useParams<{ userId: string }>();
  const activeTeam = useActiveTeam();
  const { t } = useTranslation();

  const [allPermissions, setAllPermissions] = useState<PermissionWithGrantable[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingPermissions, setPendingPermissions] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!activeTeam?.id || !userId) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch all permissions with grantability info, user's permissions, and team members in parallel
      const [permissionsRes, userPermissionsRes, teamMembersRes] = await Promise.all([
        permissionsClient["auth"]["teams"][":teamId"]["permissions"].$get({
          param: { teamId: activeTeam.id },
        }),
        permissionsClient["auth"]["teams"][":teamId"]["members"][":userId"]["permissions"].$get({
          param: { teamId: activeTeam.id, userId },
        }),
        teamMembersClient["auth"]["teams"][":teamId"]["members"].$get({
          param: { teamId: activeTeam.id },
        }),
      ]);

      const permissionsJson = await permissionsRes.json();
      const userPermissionsJson = await userPermissionsRes.json();
      const teamMembersJson = await teamMembersRes.json();

      if (permissionsJson.success && permissionsJson.permissions) {
        setAllPermissions(permissionsJson.permissions);
      }

      if (userPermissionsJson.success && userPermissionsJson.permissions) {
        setUserPermissions(userPermissionsJson.permissions);
      }

      if (teamMembersJson.success && teamMembersJson.members) {
        const member = teamMembersJson.members.find((m) => m.userId === userId);
        if (member) {
          setUserEmail(member.user.email);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t`Failed to load permissions data`);
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam?.id, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasPermission = (permissionId: string): boolean => {
    return userPermissions.some((p) => p.permissionId === permissionId);
  };

  const handlePermissionToggle = async (permissionId: string, currentlyHas: boolean) => {
    if (!activeTeam?.id || !userId) return;

    // Add to pending set
    setPendingPermissions((prev) => new Set([...prev, permissionId]));

    try {
      if (currentlyHas) {
        // Revoke permission
        const res = await permissionsClient["auth"]["teams"][":teamId"]["members"][":userId"]["permissions"][":permissionId"].$delete({
          param: { teamId: activeTeam.id, userId, permissionId },
        });
        const json = await res.json();

        if (!json.success) {
          throw new Error(stringifyActionFailure(json.errors));
        }

        setUserPermissions((prev) => prev.filter((p) => p.permissionId !== permissionId));
        toast.success(t`Permission revoked`);
      } else {
        // Grant permission
        const res = await permissionsClient["auth"]["teams"][":teamId"]["members"][":userId"]["permissions"].$post({
          param: { teamId: activeTeam.id, userId },
          json: { permissionId },
        });
        const json = await res.json();

        if (!json.success) {
          throw new Error(stringifyActionFailure(json.errors));
        }

        if (json.permission) {
          setUserPermissions((prev) => [...prev, json.permission]);
        }
        toast.success(t`Permission granted`);
      }
    } catch (error) {
      console.error("Error toggling permission:", error);
      toast.error(error instanceof Error ? error.message : t`Failed to update permission`);
    } finally {
      // Remove from pending set
      setPendingPermissions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(permissionId);
        return newSet;
      });
    }
  };

  if (isLoading) {
    return (
      <PageTemplate
        breadcrumbs={[
          { label: t`User Settings` },
          { label: t`Team`, href: "/team" },
          { label: t`Member Permissions` },
        ]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageTemplate>
    );
  }

  return (
    <PageTemplate
      breadcrumbs={[
        { label: t`User Settings` },
        { label: t`Team`, href: "/team" },
        { label: t`Member Permissions` },
      ]}
      title={userEmail ? t`Permissions for ${userEmail}` : t`Member Permissions`}
      description={t`Manage what this team member is allowed to do. Toggle permissions on or off instantly.`}
    >
      <div className="space-y-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t`Permissions`}</CardTitle>
            <CardDescription>
              {t`Select which permissions this team member should have`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allPermissions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                {t`No permissions are available to manage.`}
              </p>
            ) : (
              <div className="space-y-4">
                {allPermissions.map((permission) => {
                  const has = hasPermission(permission.id);
                  const isPending = pendingPermissions.has(permission.id);
                  const isDisabled = isPending;

                  return (
                    <div
                      key={permission.id}
                      className={`flex items-start gap-3 ${isDisabled && !isPending ? "opacity-60" : ""}`}
                    >
                      <div className="pt-0.5">
                        {isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Checkbox
                            id={permission.id}
                            checked={has}
                            disabled={isDisabled}
                            onCheckedChange={() => handlePermissionToggle(permission.id, has)}
                          />
                        )}
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <Label
                          htmlFor={permission.id}
                          className={`text-sm font-medium cursor-pointer ${isDisabled ? "cursor-not-allowed" : ""}`}
                        >
                          {permission.name}
                        </Label>
                        {permission.description && (
                          <p className="text-sm text-muted-foreground">{permission.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTemplate>
  );
}
