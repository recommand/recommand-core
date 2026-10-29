import { Avatar, AvatarFallback, AvatarImage } from '@core/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@core/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@core/components/ui/sidebar';
import type { MenuItem } from '@core/lib/menu-store';
import { ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

export function NavUser({
  user,
  userMenuItems,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
  userMenuItems: Record<string, MenuItem[]>;
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="-mx-1.5 w-[calc(100%+(--spacing(3)))] px-1.5 group-data-[collapsible=icon]:mx-0 data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="size-8">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-sidebar-accent text-xs text-sidebar-accent-foreground">
                {user.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm text-sidebar-accent-foreground">{user.name}</span>
              <span className="truncate text-xs text-sidebar-muted-foreground">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <Link
                to="/account"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent cursor-default"
              >
                <Avatar className="size-8">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="text-xs">
                    {user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </Link>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {Object.entries(userMenuItems).map(([group, items], index) => (
              <React.Fragment key={group}>
                <DropdownMenuGroup>
                  {items.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={item.onClick}
                      render={!item.onClick && item.href ? <Link to={item.href} /> : undefined}
                    >
                      {item.onClick || item.href ? (
                        <>
                          {item.icon && <item.icon />}
                          {item.title}
                        </>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {index < Object.keys(userMenuItems).length - 1 && <DropdownMenuSeparator />}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
