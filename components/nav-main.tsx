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
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Trailing count on a nav item — the sidebar's "something is waiting" signal. */
function NavBadge({ value }: { value: string | number }) {
  return (
    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[11px] font-medium tabular-nums text-sidebar-primary-foreground">
      {value}
    </span>
  );
}

export function NavMain({
  label,
  items,
}: {
  label?: string;
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    badge?: string | number;
    isActive?: boolean;
    onClick?: () => void;
    items?: {
      title: string;
      url: string;
      onClick?: () => void;
      badge?: string | number;
    }[];
  }[];
}) {
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
                asChild
                defaultOpen={item.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <div className="flex items-center">
                    {hasNoAction ? (
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.title} className="flex-1 cursor-pointer">
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                          {item.badge != null && state === 'expanded' && (
                            <NavBadge value={item.badge} />
                          )}
                          {state === 'expanded' && (
                            <ChevronRight
                              className={`${item.badge != null ? '' : 'ml-auto '}size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90`}
                            />
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    ) : (
                      <>
                        <SidebarMenuButton
                          tooltip={item.title}
                          asChild={!item.onClick}
                          onClick={item.onClick}
                          className="flex-1"
                        >
                          {item.onClick ? (
                            <>
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                              {item.badge != null && <NavBadge value={item.badge} />}
                            </>
                          ) : (
                            <Link to={item.url} onClick={closeMobileSidebar}>
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                              {item.badge != null && <NavBadge value={item.badge} />}
                            </Link>
                          )}
                        </SidebarMenuButton>
                        {state === 'expanded' && (
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="p-2 hover:bg-sidebar-accent rounded-md cursor-pointer"
                            >
                              <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </button>
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
                                asChild={!subItem.onClick}
                                onClick={subItem.onClick}
                                className={hasAction ? 'cursor-pointer' : ''}
                              >
                                {subItem.onClick ? (
                                  <span className="flex w-full items-center">
                                    <span>{subItem.title}</span>
                                    {subItem.badge != null && <NavBadge value={subItem.badge} />}
                                  </span>
                                ) : (
                                  <Link to={subItem.url} onClick={closeMobileSidebar}>
                                    <span>{subItem.title}</span>
                                    {subItem.badge != null && <NavBadge value={subItem.badge} />}
                                  </Link>
                                )}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            );
          }

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                asChild={!item.onClick}
                onClick={item.onClick}
              >
                {item.onClick ? (
                  <>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {item.badge != null && <NavBadge value={item.badge} />}
                  </>
                ) : (
                  <Link to={item.url} onClick={closeMobileSidebar}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {item.badge != null && <NavBadge value={item.badge} />}
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
