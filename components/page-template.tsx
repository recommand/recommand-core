import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbItem as UIBreadcrumbItem,
} from '@core/components/ui/breadcrumb';
import { SidebarTrigger } from '@core/components/ui/sidebar';
import { useUIConfig } from '@core/lib/ui-config-store';
import { cn } from '@core/lib/utils';
import { Fragment, type ReactNode } from 'react';

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

/**
 * A page in the work area: a top bar with the breadcrumbs and the app's
 * global actions (`topbar.actions` UI config), the page title with its
 * description and buttons, and the content.
 */
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
  const topbarActions = useUIConfig<ReactNode>('topbar.actions', null);
  const current = breadcrumbs.at(-1);

  return (
    <div className={cn('flex min-h-full flex-col', className)} style={style}>
      <header className="sticky top-0 z-10 flex h-topbar shrink-0 items-center justify-between gap-4 border-b bg-background px-gutter">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are a fixed path; labels may repeat.
                  <Fragment key={index}>
                    <UIBreadcrumbItem className={cn(!isLast && 'hidden md:inline-flex')}>
                      {item.href && !isLast ? (
                        <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      )}
                    </UIBreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator className="hidden md:inline-flex" />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        {topbarActions && <div className="flex shrink-0 items-center gap-2">{topbarActions}</div>}
      </header>
      {current && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-gutter pt-gutter pb-1">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-page-title">
              {title !== undefined ? title : current.label || '...'}
            </h1>
            <title>{current.label || '...'}</title>
            {description && (
              <p className="max-w-2xl text-sm text-balance text-muted-foreground">{description}</p>
            )}
          </div>
          {buttons && buttons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {buttons.map((button, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the buttons are passed as a fixed list.
                <Fragment key={index}>{button}</Fragment>
              ))}
            </div>
          )}
        </div>
      )}
      <main className={cn('flex-1 space-y-4 px-gutter pt-4 pb-gutter', mainClassName)}>
        {children}
      </main>
    </div>
  );
}
