import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@core/components/ui/avatar";
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
import type { MenuItem } from "@core/lib/menu-store";

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
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {user.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <Link to="/account" className="flex items-center gap-2 px-1 py-1.5 text-left text-sm rounded-sm hover:bg-accent transition-colors cursor-default">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
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
                      asChild={!item.onClick && !!item.href}
                    >
                      {item.onClick ? (
                        <>
                          {item.icon && <item.icon />}
                          {item.title}
                        </>
                      ) : item.href ? (
                        <Link to={item.href}>
                          {item.icon && <item.icon />}
                          {item.title}
                        </Link>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {index < Object.keys(userMenuItems).length - 1 && (
                  <DropdownMenuSeparator />
                )}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
