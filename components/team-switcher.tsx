import type { Auth } from '@core/api/auth';
import { Button } from '@core/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@core/components/ui/dialog';
import { Input } from '@core/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@core/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@core/components/ui/popover';
import { Skeleton } from '@core/components/ui/skeleton';
import { toast } from '@core/components/ui/sonner';
import type { Team } from '@core/data/teams';
import { useTranslation } from '@core/hooks/use-translation';
import type { MenuItem } from '@core/lib/menu-store';
import { useUIConfig } from '@core/lib/ui-config-store';
import { useUserStore } from '@core/lib/user-store';
import { cn } from '@core/lib/utils';
import { rc } from '@recommand/lib/client';
import { stringifyActionFailure } from '@recommand/lib/utils';
import { Check, ChevronDown, Pencil, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const client = rc<Auth>('core');

type TeamMeta = (team: Team, place: 'sidebar' | 'panel') => ReactNode;

// Admins also see teams they are not a member of.
type ListedTeam = Team & { isMember?: boolean };

/** The team's logo, or its initials, on a small tile. */
function TeamTile({ team, className }: { team: Team; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background text-micro font-medium text-foreground',
        className,
      )}
    >
      {team.logoUrl ? (
        // biome-ignore lint/performance/noImgElement: a plain Vite app; there is no image component to use.
        <img src={team.logoUrl} alt="" className="size-full object-contain p-0.5" />
      ) : (
        team.name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join('')
          .toUpperCase()
      )}
    </span>
  );
}

/** A section heading in the panel, in the table-head style. */
function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-table-head text-muted-foreground [text-transform:var(--table-head-transform)]">
      {children}
    </div>
  );
}

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreateTeamDialogOpen, setIsCreateTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditTeamDialogOpen, setIsEditTeamDialogOpen] = useState(false);
  const [editTeamName, setEditTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const fetchTeams = useUserStore((x) => x.fetchTeams);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();
  // A line under each team's name, such as its environment, set by the app
  // through the `team-switcher.meta` UI config. `place` says whether it is
  // drawn in the sidebar or in the panel.
  const teamMeta = useUIConfig<TeamMeta | null>('team-switcher.meta', null);

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
        setNewTeamName('');
        toast.success(t`Team created successfully`);
      } else {
        throw new Error(stringifyActionFailure(json.errors));
      }
    } catch (error) {
      console.error('Error creating team:', error);
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
      const response = await client.auth.teams[':teamId'].$put({
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
        setEditTeamName('');
        setEditingTeam(null);
        toast.success(t`Team name updated successfully`);
      } else {
        throw new Error(stringifyActionFailure(json.errors));
      }
    } catch (error) {
      console.error('Error updating team:', error);
      toast.error(
        t`Failed to update team name: ${error instanceof Error ? t(error.message) : t`Unknown error`}`,
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const matches = (team: Team) =>
    !searchQuery.trim() || team.name.toLowerCase().includes(searchQuery.toLowerCase());
  const myTeams = teams.filter(
    (team: ListedTeam) => (team.isMember === true || team.isMember === undefined) && matches(team),
  );
  const otherTeams = teams.filter((team: ListedTeam) => team.isMember === false && matches(team));

  const chooseTeam = (team: Team) => {
    setActiveTeam(team);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  if (!activeTeam) {
    return (
      <div className="flex h-14 flex-col justify-center gap-1.5 rounded-lg border border-sidebar-border-strong px-3 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-28 bg-sidebar-accent" />
        <Skeleton className="h-3 w-16 bg-sidebar-accent" />
      </div>
    );
  }

  const rowClassName =
    'group/team flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent data-current:bg-active';

  return (
    <>
      <Popover
        open={isDropdownOpen}
        onOpenChange={(open) => {
          setIsDropdownOpen(open);
          if (!open) {
            setSearchQuery('');
          }
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border-strong px-3 py-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-sidebar-accent group-data-[collapsible=icon]:size-control group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
            />
          }
        >
          <TeamTile
            team={activeTeam}
            className="hidden size-7 group-data-[collapsible=icon]:flex"
          />
          <div className="grid min-w-0 flex-1 gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm text-sidebar-accent-foreground">
              {activeTeam.name}
            </span>
            {teamMeta && <span className="truncate">{teamMeta(activeTeam, 'sidebar')}</span>}
          </div>
          <ChevronDown className="size-4 shrink-0 text-sidebar-muted-foreground group-data-[collapsible=icon]:hidden" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          className="flex w-90 max-w-[calc(100vw-2rem)] flex-col gap-1 p-1"
        >
          {teams.length > 5 && (
            <InputGroup className="h-control-sm">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder={t`Search teams...`}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoFocus
              />
            </InputGroup>
          )}

          {myTeams.length > 0 && (
            <div className="flex flex-col">
              <PanelLabel>{t`My Teams`}</PanelLabel>
              <div className="flex max-h-75 flex-col gap-0.5 overflow-y-auto">
                {myTeams.map((team) => (
                  <div key={team.id} className="relative">
                    <button
                      type="button"
                      data-current={team.id === activeTeam.id ? '' : undefined}
                      className={rowClassName}
                      onClick={() => chooseTeam(team)}
                    >
                      <TeamTile team={team} />
                      <div className="grid min-w-0 flex-1">
                        <span className="truncate">{team.name}</span>
                        {teamMeta && <span className="truncate">{teamMeta(team, 'panel')}</span>}
                      </div>
                      {team.id === activeTeam.id && (
                        <Check className="mr-8 size-4 text-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={t`Edit team name`}
                      onClick={() => handleEditTeam(team)}
                      className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 [div:hover>&]:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherTeams.length > 0 && (
            <div className="flex flex-col border-t pt-1">
              <PanelLabel>{t`Other Teams`}</PanelLabel>
              <div className="flex max-h-50 flex-col gap-0.5 overflow-y-auto">
                {otherTeams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    className={rowClassName}
                    onClick={() => chooseTeam(team)}
                  >
                    <TeamTile team={team} />
                    <span className="truncate">{team.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchQuery.trim() && myTeams.length === 0 && otherTeams.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">{t`No teams found`}</div>
          )}

          {!searchQuery.trim() && (
            <div className="flex flex-col gap-0.5 border-t pt-1">
              <button
                type="button"
                className={rowClassName}
                onClick={() => {
                  setIsCreateTeamDialogOpen(true);
                  setIsDropdownOpen(false);
                }}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border">
                  <Plus className="size-4" />
                </span>
                {t`Add team`}
              </button>
              {menuItems &&
                Object.values(menuItems)
                  .flat()
                  .map((item) => {
                    const content = (
                      <>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border">
                          {item.icon && <item.icon className="size-4" />}
                        </span>
                        <span className="truncate">{item.title}</span>
                      </>
                    );
                    return item.href && !item.onClick ? (
                      <Link
                        key={item.id}
                        to={item.href}
                        className={rowClassName}
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        key={item.id}
                        type="button"
                        className={rowClassName}
                        onClick={() => {
                          setIsDropdownOpen(false);
                          item.onClick?.();
                        }}
                      >
                        {content}
                      </button>
                    );
                  })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={isCreateTeamDialogOpen} onOpenChange={setIsCreateTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Create a new team`}</DialogTitle>
            <DialogDescription>{t`Add a new team to collaborate with others.`}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                id="name"
                placeholder={t`Team name`}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTeam();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateTeamDialogOpen(false)}>
              {t`Cancel`}
            </Button>
            <Button onClick={handleCreateTeam} disabled={isCreating || !newTeamName.trim()}>
              {isCreating ? t`Creating...` : t`Create team`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditTeamDialogOpen} onOpenChange={setIsEditTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Edit team name`}</DialogTitle>
            <DialogDescription>{t`Update the name of "${editingTeam?.name}".`}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                id="editName"
                placeholder={t`Team name`}
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
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
                setEditTeamName('');
                setEditingTeam(null);
              }}
            >
              {t`Cancel`}
            </Button>
            <Button
              onClick={handleUpdateTeam}
              disabled={isUpdating || !editTeamName.trim() || editTeamName === editingTeam?.name}
            >
              {isUpdating ? t`Updating...` : t`Update team`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
