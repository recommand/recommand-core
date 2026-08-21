import { NavMain } from '@core/components/nav-main';
import { NavUser } from '@core/components/nav-user';
import { TeamSwitcher } from '@core/components/team-switcher';
import { ButtonLink } from '@core/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@core/components/ui/sidebar';
import { useTranslation } from '@core/hooks/use-translation';
import { type MenuItem, useMenuGroups, useMenuItems } from '@core/lib/menu-store';
import { useUserStore } from '@core/lib/user-store';
import type { LucideIcon } from 'lucide-react';
import { LogIn } from 'lucide-react';
import type * as React from 'react';
import { useLocation } from 'react-router-dom';

const buildMenuItems = (menuItems: MenuItem[], currentPath: string, prefix: string) => {
  return menuItems
    .filter((item) => item.id.startsWith(prefix))
    .reduce(
      (acc, item) => {
        const parts = item.id.split('.');
        if (parts.length <= 2) {
          // This is a root item
          acc.push({
            title: item.title,
            url: item.href || '#',
            onClick: item.onClick,
            icon: item.icon as LucideIcon,
            badge: item.badge,
            isActive: item.isActive || item.href === currentPath,
            items: menuItems
              .filter(
                (subItem) =>
                  subItem.id.startsWith(prefix) &&
                  subItem.id.split('.').length > 2 &&
                  subItem.id.split('.').slice(0, -1).join('.') === item.id,
              )
              .map((subItem) => ({
                title: subItem.title,
                url: subItem.href || '#',
                onClick: subItem.onClick,
                badge: subItem.badge,
              })),
          });
        }
        return acc;
      },
      [] as Array<{
        title: string;
        url: string;
        onClick?: () => void;
        icon?: LucideIcon;
        badge?: string | number;
        isActive?: boolean;
        items?: Array<{
          title: string;
          url: string;
          onClick?: () => void;
          badge?: string | number;
        }>;
      }>,
    );
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const menuItems = useMenuItems();
  const menuGroups = useMenuGroups();
  const location = useLocation();
  const { user, teams, activeTeam, setActiveTeam } = useUserStore();
  const { t } = useTranslation();

  // Build the menu hierarchy for main items
  const defaultItems = buildMenuItems(
    menuItems.filter((item) => !item.groupId),
    location.pathname,
    'main',
  );

  // Group user menu items by their group (second part of the ID)
  const userMenuItems = menuItems
    .filter((item) => item.id.startsWith('user.'))
    .reduce(
      (groups, item) => {
        const parts = item.id.split('.');
        const group = parts.length > 2 ? parts[1] : 'default';
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(item);
        return groups;
      },
      {} as Record<string, MenuItem[]>,
    );

  // Group team menu items by their group (second part of the ID)
  const teamMenuItems = menuItems
    .filter((item) => item.id.startsWith('team.'))
    .reduce(
      (groups, item) => {
        const parts = item.id.split('.');
        const group = parts.length > 2 ? parts[1] : 'default';
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(item);
        return groups;
      },
      {} as Record<string, typeof menuItems>,
    );

  // Transform user data for NavUser component
  const userData = user
    ? {
        name: user.email.split('@')[0], // Use part before @ as name
        email: user.email,
        avatar: '',
      }
    : null;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={teams}
          activeTeam={activeTeam}
          setActiveTeam={setActiveTeam}
          menuItems={teamMenuItems}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={defaultItems} />
        {menuGroups.map((group) => (
          <NavMain
            key={group.id}
            label={group.title}
            items={buildMenuItems(
              menuItems.filter((item) => item.groupId === group.id),
              location.pathname,
              group.id,
            )}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        {userData ? (
          <NavUser user={userData} userMenuItems={userMenuItems} />
        ) : (
          <div className="p-4">
            <ButtonLink variant="outline" className="w-full" href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              {t`Login`}
            </ButtonLink>
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
