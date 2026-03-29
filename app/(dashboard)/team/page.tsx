import { PageTemplate } from "@core/components/page-template";
import { rc } from "@recommand/lib/client";
import type { TeamMembers } from "api/team-members";
import type { Auth } from "api/auth";
import type { TeamLogo } from "api/team-logo";
import { useEffect, useState, useCallback } from "react";
import { DataTable } from "@core/components/data-table";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
import { toast } from "@core/components/ui/sonner";
import { stringifyActionFailure } from "@recommand/lib/utils";
import type { MinimalTeamMember } from "@core/data/team-members";
import { useActiveTeam, useHasPermission, useFeatures } from "@core/hooks/user";
import { AsyncButton } from "@core/components/async-button";
import { Trash2, Loader2, Copy, Shield, Upload, X } from "lucide-react";
import { ColumnHeader } from "@core/components/data-table/column-header";
import { ConfirmDialog } from "@core/components/confirm-dialog";
import { useNavigate, Link } from "react-router";
import { useUserStore } from "@core/lib/user-store";
import { useTranslation } from "@core/hooks/use-translation";
import { useDataTableState } from "@core/hooks/use-data-table-state";
import { DataTablePagination } from "@core/components/data-table/pagination";

const client = rc<TeamMembers>("core");
const authClient = rc<Auth>("core");
const teamLogoClient = rc<TeamLogo>("core");

export default function Page() {
  const [teamMembers, setTeamMembers] = useState<MinimalTeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const [teamName, setTeamName] = useState("");
  const activeTeam = useActiveTeam();
  const navigate = useNavigate();
  const canManageTeam = useHasPermission("core.team.manage");
  const fetchTeams = useUserStore((x) => x.fetchTeams);
  const { t } = useTranslation();
  const { teamLogoEnabled } = useFeatures();
  const { paginationState, onPaginationChange, sortingState, onSortingChange } = useDataTableState({ tableId: "core-team" });

  const fetchTeamMembers = useCallback(async () => {
    if (!activeTeam?.id) {
      setTeamMembers([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await client["auth"]["teams"][":teamId"]["members"].$get({
        param: { teamId: activeTeam.id },
      });
      const json = await response.json();

      if (!json.success || !Array.isArray(json.members)) {
        console.error("Invalid API response format:", json);
        toast.error(t`Failed to load team members`);
        setTeamMembers([]);
      } else {
        setTeamMembers(
          json.members.map((member) => ({
            ...member,
            createdAt: new Date(member.createdAt),
            updatedAt: new Date(member.updatedAt),
            user: {
              ...member.user,
              createdAt: new Date(member.user.createdAt),
              updatedAt: new Date(member.user.updatedAt),
            },
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching team members:", error);
      toast.error(t`Failed to load team members`);
      setTeamMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  useEffect(() => {
    if (activeTeam?.name) {
      setTeamName(activeTeam.name);
    }
  }, [activeTeam?.name]);

  const handleSaveTeamName = async () => {
    if (!activeTeam?.id || !teamName.trim()) return;
    try {
      const response = await authClient["auth"]["teams"][":teamId"].$put({
        param: { teamId: activeTeam.id },
        json: { name: teamName.trim() },
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }
      await fetchTeams();
      toast.success(t`Team name updated`);
    } catch (error) {
      console.error("Error updating team name:", error);
      toast.error(t`Failed to update team name`);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam?.id || !newMemberEmail.trim()) {
      toast.error(t`Please enter a valid email address`);
      return;
    }

    setIsAddingMember(true);
    try {
      const response = await client["auth"]["teams"][":teamId"]["members"].$post({
        param: { teamId: activeTeam.id },
        json: { email: newMemberEmail },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      setNewMemberEmail("");
      toast.success(json.message || t`Team member added successfully`);
      fetchTeamMembers();
    } catch (error) {
      console.error("Error adding team member:", error);
      toast.error(t`Failed to add team member`);
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTeam?.id) return;

    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch(`/api/core/auth/teams/${activeTeam.id}/logo`, {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      await fetchTeams();
      toast.success(t`Logo uploaded successfully`);
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error(t`Failed to upload logo`);
    } finally {
      setIsUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!activeTeam?.id) return;

    setIsRemovingLogo(true);
    try {
      const response = await teamLogoClient["auth"]["teams"][":teamId"]["logo"].$delete({
        param: { teamId: activeTeam.id },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      await fetchTeams();
      toast.success(t`Logo removed successfully`);
    } catch (error) {
      console.error("Error removing logo:", error);
      toast.error(t`Failed to remove logo`);
    } finally {
      setIsRemovingLogo(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!activeTeam?.id) {
      toast.error(t`No active team selected`);
      return;
    }

    setIsDeletingTeam(true);
    try {
      const response = await authClient["auth"]["teams"][":teamId"].$delete({
        param: { teamId: activeTeam.id },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error(stringifyActionFailure(json.errors));
      }

      toast.success(t`Team deleted successfully`);
      // Clear the current active team
      useUserStore.getState().removeTeam(activeTeam.id);
      // Navigate to a safe location after team deletion
      navigate("/");
    } catch (error) {
      console.error("Error deleting team:", error);
      toast.error(t`Failed to delete team`);
    } finally {
      setIsDeletingTeam(false);
    }
  };

  const columns: ColumnDef<MinimalTeamMember>[] = [
    {
      accessorKey: "user.id",
      header: ({ column }) => <ColumnHeader column={column} title={t`User ID`} />,
      size: 200,
      cell: ({ row }) => {
        const userId = row.original.user.id;
        if (!userId) return <div className="text-muted-foreground">N/A</div>;

        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">
              {userId.length > 12
                ? `${userId.slice(0, 6)}...${userId.slice(-6)}`
                : userId}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(userId);
                toast.success(t`User ID copied to clipboard`);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
    {
      accessorKey: "user.email",
      header: ({ column }) => <ColumnHeader column={column} title={t`Email`} />,
      cell: ({ row }) => row.original.user.email ?? "N/A",
    },
    {
      accessorKey: "user.emailVerified",
      header: ({ column }) => <ColumnHeader column={column} title={t`Verified`} />,
      cell: ({ row }) => (
        <div className="flex items-center">
          {row.original.user.emailVerified ? (
            <span className="text-folder">{t`Verified`}</span>
          ) : (
            <span className="text-warning">{t`Unverified`}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <ColumnHeader column={column} title={t`Joined At`} />
      ),
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as Date;
        return date ? date.toLocaleDateString() : "N/A";
      },
      sortingFn: "datetime",
    },
    {
      id: "actions",
      header: "",
      size: 140,
      cell: ({ row }) => {
        const userId = row.original.user.id;
        if (!userId) return null;

        return (
          <div className="flex items-center justify-end gap-1">
            {canManageTeam && (
              <Button
                variant="ghost"
                size="icon"
                asChild
                title={t`Manage permissions`}
              >
                <Link to={`/team/member/${userId}`}>
                  <Shield className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              title={t`Remove team member`}
              onClick={() => {
                if (!activeTeam?.id) return;

                client["auth"]["teams"][":teamId"]["members"][":userId"]
                  .$delete({
                    param: {
                      teamId: activeTeam.id,
                      userId: userId,
                    },
                  })
                  .then(async (res: Response) => {
                    const json = await res.json();
                    if (json.success) {
                      toast.success(t`Team member removed successfully`);
                      fetchTeamMembers();
                    } else {
                      toast.error(stringifyActionFailure(json.errors));
                    }
                  })
                  .catch((error) => {
                    console.error("Error removing team member:", error);
                    toast.error(t`Failed to remove team member`);
                  });
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: teamMembers,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: onSortingChange,
    onPaginationChange: onPaginationChange,
    autoResetPageIndex: false,
    state: {
      sorting: sortingState,
      pagination: paginationState,
    },
  });

  return (
    <PageTemplate
      breadcrumbs={[{ label: t`User Settings` }, { label: t`Team` }]}
      buttons={[
        <ConfirmDialog
          key="delete-team-dialog"
          title={t`Delete Team`}
          description={t`Are you sure you want to delete the team "${activeTeam?.name}"? This action cannot be undone. All team members, API keys, and associated data will be permanently removed.`}
          confirmButtonText={t`Delete Team`}
          onConfirm={handleDeleteTeam}
          isLoading={isDeletingTeam}
          trigger={
            <Button variant="destructive" disabled={isDeletingTeam}>
              {isDeletingTeam ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t`Deleting...`}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t`Delete Team`}
                </>
              )}
            </Button>
          }
        />,
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 max-w-xl">
          <Input
            placeholder={t`Email address to invite`}
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddMember(e);
              }
            }}
            disabled={isAddingMember}
          />
          <Button
            onClick={handleAddMember}
            disabled={isAddingMember || !newMemberEmail.trim()}
          >
            {isAddingMember ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t`Inviting...`}
              </>
            ) : (
              t`Invite Member`
            )}
          </Button>
        </div>
        <div className="rounded-lg border p-4 space-y-4 max-w-xl bg-muted">
          <div className="space-y-3">
            {teamLogoEnabled && (
            <div>
              <label className="text-sm font-medium">{t`Team Logo`}</label>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex size-16 items-center justify-center rounded-lg border bg-sheet-light p-2 overflow-hidden">
                  <img
                    src={activeTeam?.logoUrl || "/icon.svg"}
                    alt={activeTeam?.name ?? ""}
                    className="size-full object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUploadingLogo}
                    onClick={() => document.getElementById("logo-upload")?.click()}
                  >
                    {isUploadingLogo ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {activeTeam?.logoUrl ? t`Change Logo` : t`Upload Logo`}
                  </Button>
                  {activeTeam?.logoUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRemovingLogo}
                      onClick={handleRemoveLogo}
                    >
                      {isRemovingLogo ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <X className="h-4 w-4 mr-2" />
                      )}
                      {t`Remove`}
                    </Button>
                  )}
                </div>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleUploadLogo}
                />
              </div>
            </div>
            )}
            <div>
              <label className="text-sm font-medium">{t`Team Name`}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
                <AsyncButton
                  variant="outline"
                  onClick={handleSaveTeamName}
                  disabled={!teamName.trim() || teamName.trim() === activeTeam?.name}
                >
                  {t`Save`}
                </AsyncButton>
              </div>
            </div>
            <div>
              <div className="space-y-2">
                <h3 className="font-medium">{t`Team ID`}</h3>
                <p className="text-sm text-muted-foreground">
                  {t`This is your unique team identifier`} (
                  <code className="font-mono">teamId</code>).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={activeTeam?.id ?? ""}
                  readOnly
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (activeTeam?.id) {
                      navigator.clipboard.writeText(activeTeam.id);
                      toast.success(t`Team ID copied to clipboard`);
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DataTable columns={columns} table={table} />
            <DataTablePagination table={table} />
          </>
        )}
      </div>
    </PageTemplate>
  );
}
