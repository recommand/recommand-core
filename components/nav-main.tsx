import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@core/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@core/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@core/components/ui/tooltip';
import type { MenuItemAction } from '@core/lib/menu-store';
import { cn } from '@core/lib/utils';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

type BadgeVariant = 'default' | 'action';

/**
 * Trailing count on a nav item. Neutral counts are plain text in the
 * sidebar's muted colour; a count that needs action takes the warning colour.
 */
function NavBadge({
  value,
  variant = 'default',
}: {
  value: string | number;
  variant?: BadgeVariant;
}) {
  return (
    <span
      data-variant={variant}
      className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm px-1.5 text-micro text-sidebar-muted-foreground group-data-[collapsible=icon]:hidden data-[variant=action]:bg-warning data-[variant=action]:text-foreground"
    >
      {value}
    </span>
  );
}

/** Right-hand segment of a split nav item, e.g. "open the current record". */
function NavAction({ action, onNavigate }: { action: MenuItemAction; onNavigate: () => void }) {
  const className =
    'flex size-control shrink-0 cursor-pointer items-center justify-center rounded-r-md text-sidebar-muted-foreground outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          action.onClick ? (
            <button
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              className={className}
            />
          ) : (
            <Link
              to={action.href ?? '#'}
              onClick={onNavigate}
              aria-label={action.label}
              className={className}
            />
          )
        }
      >
        <action.icon />
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {action.label}
      </TooltipContent>
    </Tooltip>
  );
}

type NavItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: string | number;
  badgeVariant?: BadgeVariant;
  action?: MenuItemAction;
  isActive?: boolean;
  onClick?: () => void;
  items?: {
    title: string;
    url: string;
    onClick?: () => void;
    badge?: string | number;
    badgeVariant?: BadgeVariant;
  }[];
};

/** The label, icon and badge of an item. */
function ItemContent({
  item,
}: {
  item: Pick<NavItem, 'icon' | 'title' | 'badge' | 'badgeVariant'>;
}) {
  return (
    <>
      {item.icon && <item.icon />}
      <span>{item.title}</span>
      {item.badge != null && <NavBadge value={item.badge} variant={item.badgeVariant} />}
    </>
  );
}

export function NavMain({ label, items }: { label?: string; items: NavItem[] }) {
  const { state, isMobile, setOpenMobile } = useSidebar();

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          if (item.items?.length) {
            const hasNoAction = !item.onClick && (!item.url || item.url === '#');

            return (
              <Collapsible
                key={item.title}
                defaultOpen={item.isActive}
                className="group/collapsible"
                render={<SidebarMenuItem />}
              >
                <div className="flex items-center">
                  {hasNoAction ? (
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton tooltip={item.title} className="flex-1 cursor-pointer" />
                      }
                    >
                      <ItemContent item={item} />
                      {state === 'expanded' && (
                        <ChevronRight
                          className={cn(
                            'size-4 text-sidebar-muted-foreground transition-transform duration-200 group-data-open/collapsible:rotate-90',
                            item.badge == null && 'ml-auto',
                          )}
                        />
                      )}
                    </CollapsibleTrigger>
                  ) : (
                    <>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={item.isActive}
                        onClick={item.onClick}
                        className="flex-1"
                        render={
                          item.onClick ? undefined : (
                            <Link to={item.url} onClick={closeMobileSidebar} />
                          )
                        }
                      >
                        <ItemContent item={item} />
                      </SidebarMenuButton>
                      {state === 'expanded' && (
                        <CollapsibleTrigger
                          render={
                            <button
                              type="button"
                              className="flex size-control shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            />
                          }
                        >
                          <ChevronRight className="size-4 transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                        </CollapsibleTrigger>
                      )}
                    </>
                  )}
                </div>
                {state === 'expanded' && (
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => {
                        const hasAction = subItem.onClick || subItem.url !== '#';
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              onClick={subItem.onClick}
                              className={hasAction ? 'cursor-pointer' : ''}
                              render={
                                subItem.onClick ? (
                                  <span />
                                ) : (
                                  <Link to={subItem.url} onClick={closeMobileSidebar} />
                                )
                              }
                            >
                              <span>{subItem.title}</span>
                              {subItem.badge != null && (
                                <NavBadge value={subItem.badge} variant={subItem.badgeVariant} />
                              )}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          }

          // With an action the item renders as a split button: the item itself on
          // the left, the action as a separate segment on the right.
          const hasAction = item.action && state === 'expanded';

          return (
            <SidebarMenuItem key={item.title} className={cn(hasAction && 'flex items-center')}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={item.isActive}
                onClick={item.onClick}
                className={cn(hasAction && 'flex-1 rounded-r-none')}
                render={
                  item.onClick ? undefined : <Link to={item.url} onClick={closeMobileSidebar} />
                }
              >
                <ItemContent item={item} />
              </SidebarMenuButton>
              {hasAction && item.action && (
                <>
                  <div className="h-4 w-px shrink-0 bg-sidebar-border opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100" />
                  <NavAction action={item.action} onNavigate={closeMobileSidebar} />
                </>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
