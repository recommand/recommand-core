import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@core/components/ui/breadcrumb";
import { SidebarInset, SidebarTrigger } from "@core/components/ui/sidebar";
import { Separator } from "@core/components/ui/separator";
import { cn } from "@core/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  mainClassName?: string;
  style?: React.CSSProperties;
  buttons?: React.ReactNode[];
  description?: string;
  title?: React.ReactNode;
}

export function PageTemplate({
  children,
  breadcrumbs = [],
  className,
  mainClassName,
  style,
  buttons,
  description,
  title,
}: PageProps) {
  return (
    <SidebarInset className={className} style={style}>
      <div className="py-4 space-y-2 border-b border-border">
        <header className="flex shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex w-full items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="data-[orientation=vertical]:h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map(
                    (item, index) =>
                      index !== breadcrumbs.length - 1 && (
                        <div key={index} className="flex items-center gap-2">
                          <BreadcrumbItem
                            key={index}
                            className="hidden md:block"
                          >
                            {item.href ? (
                              <BreadcrumbLink href={item.href}>
                                {item.label}
                              </BreadcrumbLink>
                            ) : (
                              <BreadcrumbPage>{item.label}</BreadcrumbPage>
                            )}
                          </BreadcrumbItem>
                          {index < breadcrumbs.length - 2 && (
                            <BreadcrumbSeparator className="hidden md:block" />
                          )}
                        </div>
                      )
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2 min-h-[36px]">
              {buttons &&
                buttons.map((button, index) => <div key={index}>{button}</div>)}
            </div>
          </div>
        </header>
        {breadcrumbs.length > 0 && (
          <div className="px-4">
            <h2 className="text-2xl font-semibold">
              {title !== undefined ? title : breadcrumbs[breadcrumbs.length - 1].label || "..."}
            </h2>
            <title>{breadcrumbs[breadcrumbs.length - 1].label || "..."}</title>
            {description && (
              <p className="text-muted-foreground text-sm text-balance max-w-lg mt-1">
                {description}
              </p>
            )}
          </div>
        )}
      </div>
      <main className={cn("p-4 space-y-4", mainClassName)}>{children}</main>
    </SidebarInset>
  );
}
