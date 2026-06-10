import { ChevronsUpDown, Plus, Pencil, Search } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@core/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@core/components/ui/sidebar";
import type { Team } from "@core/data/teams";
import { Skeleton } from "@core/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@core/components/ui/dialog";
import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
import { useState } from "react";
import { useUserStore } from "@core/lib/user-store";
import { toast } from "@core/components/ui/sonner";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";
import type { Auth } from "@core/api/auth";
import type { MenuItem } from "@core/lib/menu-store";
import { useTranslation } from "@core/hooks/use-translation";

const client = rc<Auth>("core");

export function TeamSwitcher({
  teams,
  activeTeam,
  setActiveTeam,
  menuItems,
}: {
  teams: Team[];
  activeTeam: Team | null;
  setActiveTeam: (team: Team) => void;
  menuItems: Record<string, MenuItem[]>;
}) {
  const { isMobile } = useSidebar();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreateTeamDialogOpen, setIsCreateTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isEditTeamDialogOpen, setIsEditTeamDialogOpen] = useState(false);
  const [editTeamName, setEditTeamName] = useState("");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const fetchTeams = useUserStore((x) => x.fetchTeams);
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useTranslation();

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      toast.error(t`Please enter a team name`);
      return;
    }

    setIsCreating(true);
    try {
      const response = await client.auth.teams.$post({
        json: {
          name: newTeamName,
        },
      });
      const json = await response.json();

      if (json.success) {
        const newTeam = {
          ...json.data,
          createdAt: new Date(json.data.createdAt),
          updatedAt: new Date(json.data.updatedAt || json.data.createdAt),
        };
        await fetchTeams();
        setActiveTeam(newTeam);
        setIsCreateTeamDialogOpen(false);
        setNewTeamName("");
        toast.success(t`Team created successfully`);
      } else {
        throw new Error(stringifyActionFailure(json.errors));
      }
    } catch (error) {
      console.error("Error creating team:", error);
      toast.error(t`Failed to create team`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setIsEditTeamDialogOpen(true);
    setIsDropdownOpen(false); // Close dropdown when opening edit dialog
  };

  const handleUpdateTeam = async () => {
    if (!editTeamName.trim() || !editingTeam) {
      toast.error(t`Please enter a team name`);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await client.auth.teams[":teamId"].$put({
        param: { teamId: editingTeam.id },
        json: {
          name: editTeamName,
        },
      });
      const json = await response.json();

      if (json.success) {
        const updatedTeam = {
          ...json.data,
          createdAt: new Date(json.data.createdAt),
          updatedAt: new Date(json.data.updatedAt || json.data.createdAt),
        };
        await fetchTeams();
        if (activeTeam?.id === editingTeam.id) {
          setActiveTeam(updatedTeam);
        }
        setIsEditTeamDialogOpen(false);
        setEditTeamName("");
        setEditingTeam(null);
        toast.success(t`Team name updated successfully`);
      } else {
        throw new Error(stringifyActionFailure(json.errors));
      }
    } catch (error) {
      console.error("Error updating team:", error);
      toast.error(t`Failed to update team name: ${error instanceof Error ? error.message : t`Unknown error`}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  if (!activeTeam) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Skeleton className="size-8 rounded-lg" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1 h-3 w-16" />
            </div>
            <ChevronsUpDown className="ml-auto" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu
            open={isDropdownOpen}
            onOpenChange={(open) => {
              setIsDropdownOpen(open);
              if (!open) {
                setSearchQuery("");
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-10 items-center justify-center rounded-lg border bg-sheet-light p-1 overflow-hidden">
                  <img src={activeTeam.logoUrl || "/icon.svg"} alt={activeTeam.name} className="size-full object-contain" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {activeTeam.name}
                  </span>
                  <span className="truncate text-xs">
                    {activeTeam.teamDescription}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <div className="px-2 py-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder={t`Search teams...`}
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 h-9"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              <>
                <DropdownMenuLabel className="text-muted-foreground text-xs px-2 py-2">
                  {t`My Teams`}
                </DropdownMenuLabel>
                <div className="max-h-[300px] overflow-y-auto">
                  {teams
                    .filter((team: any) =>
                      (team.isMember === true || team.isMember === undefined) &&
                      (!searchQuery.trim() ||
                        team.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .map((team, index) => (
                      <DropdownMenuItem
                        key={team.id}
                        className="gap-2 p-2 flex justify-between group"
                        onSelect={(e) => e.preventDefault()}
                      >
                        <div
                          className="flex gap-2 items-center flex-1 cursor-pointer"
                          onClick={() => {
                            setActiveTeam(team);
                            setIsDropdownOpen(false);
                            setSearchQuery("");
                          }}
                        >
                          <div className="flex size-8 items-center justify-center rounded-lg border bg-sheet-light p-0.5 overflow-hidden">
                            <img src={team.logoUrl || "/icon.svg"} alt={team.name} className="size-full object-contain" />
                          </div>
                          {team.name}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTeam(team);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-2 hover:bg-accent rounded transition-all"
                        >
                          <Pencil className="size-3" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                </div>

                  {teams.filter((team: any) =>
                    team.isMember === false &&
                    (!searchQuery.trim() ||
                      team.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  ).length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-muted-foreground text-xs px-2 py-2">
                        {t`Other Teams`}
                      </DropdownMenuLabel>
                      <div className="max-h-[200px] overflow-y-auto">
                        {teams
                        .filter((team: any) =>
                          team.isMember === false &&
                          (!searchQuery.trim() ||
                            team.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        )
                        .map((team) => (
                          <DropdownMenuItem
                            key={team.id}
                            className="gap-2 p-2"
                            onClick={() => {
                              setActiveTeam(team);
                              setIsDropdownOpen(false);
                              setSearchQuery("");
                            }}
                          >
                            <div className="flex size-8 items-center justify-center rounded-lg border bg-sheet-light p-0.5 overflow-hidden">
                              <img src={team.logoUrl || "/icon.svg"} alt={team.name} className="size-full object-contain" />
                            </div>
                            {team.name}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </>
                  )}

                  {searchQuery.trim() &&
                   teams.filter((team: any) => team.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      {t`No teams found`}
                    </div>
                  )}

                  {!searchQuery.trim() && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        onClick={() => {
                          setIsCreateTeamDialogOpen(true);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="flex size-8 items-center justify-center rounded-lg border bg-muted">
                          <Plus className="size-5" />
                        </div>
                        <div>{t`Add team`}</div>
                      </DropdownMenuItem>
                    </>
                  )}

                  {!searchQuery.trim() && menuItems &&
                    Object.entries(menuItems).map(([group, items]) => (
                      <DropdownMenuGroup key={group}>
                        {items.map((item) => {
                          if (item.href && !item.onClick) {
                            return (
                              <DropdownMenuItem
                                key={item.id}
                                asChild
                                className="gap-2 p-2"
                              >
                                <Link to={item.href}>
                                  {item.icon && (
                                    <div className="flex size-8 items-center justify-center rounded-lg border bg-muted">
                                      <item.icon className="size-5" />
                                    </div>
                                  )}
                                  <span>{item.title}</span>
                                </Link>
                              </DropdownMenuItem>
                            );
                          } else {
                            return (
                              <DropdownMenuItem
                                key={item.id}
                                onClick={item.onClick}
                                className="gap-2 p-2"
                              >
                                {item.icon && (
                                  <div className="flex size-8 items-center justify-center rounded-lg border bg-muted">
                                    <item.icon className="size-5" />
                                  </div>
                                )}
                                <span>{item.title}</span>
                              </DropdownMenuItem>
                            );
                          }
                        })}
                      </DropdownMenuGroup>
                    ))}
              </>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog
        open={isCreateTeamDialogOpen}
        onOpenChange={setIsCreateTeamDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Create a new team`}</DialogTitle>
            <DialogDescription>
              {t`Add a new team to collaborate with others.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                id="name"
                placeholder={t`Team name`}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateTeam();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateTeamDialogOpen(false)}
            >
              {t`Cancel`}
            </Button>
            <Button
              onClick={handleCreateTeam}
              disabled={isCreating || !newTeamName.trim()}
            >
              {isCreating ? t`Creating...` : t`Create team`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditTeamDialogOpen}
        onOpenChange={setIsEditTeamDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Edit team name`}</DialogTitle>
            <DialogDescription>
              {t`Update the name of "${editingTeam?.name}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                id="editName"
                placeholder={t`Team name`}
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUpdateTeam();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditTeamDialogOpen(false);
                setEditTeamName("");
                setEditingTeam(null);
              }}
            >
              {t`Cancel`}
            </Button>
            <Button
              onClick={handleUpdateTeam}
              disabled={
                isUpdating ||
                !editTeamName.trim() ||
                editTeamName === editingTeam?.name
              }
            >
              {isUpdating ? t`Updating...` : t`Update team`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
