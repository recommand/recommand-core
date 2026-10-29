import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbItem as UIBreadcrumbItem,
} from '@core/components/ui/breadcrumb';
import { SidebarTrigger } from '@core/components/ui/sidebar';
import { useIsMobile } from '@core/hooks/use-mobile';
import { useUIConfig } from '@core/lib/ui-config-store';
import { cn } from '@core/lib/utils';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';

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
  controls?: React.ReactNode;
  description?: string;
  title?: React.ReactNode;
}

/**
 * A page in the work area: a top bar with the breadcrumbs, the app's global
 * actions (`topbar.actions` UI config) and the page's `buttons`; the page
 * title with its description and `controls`; and the content.
 *
 * `buttons` are the page's actions, such as creating, importing or
 * publishing. `controls` act on what the page shows: view switches and
 * filters, or the decisions on the record the page is about. On small
 * screens the top bar has no room for the buttons, so they move to the head.
 */
export function PageTemplate({
  children,
  breadcrumbs = [],
  className,
  mainClassName,
  style,
  buttons,
  controls,
  description,
  title,
}: PageProps) {
  const topbarActions = useUIConfig<ReactNode>('topbar.actions', null);
  const isMobile = useIsMobile();
  const current = breadcrumbs.at(-1);
  const pageButtons =
    buttons && buttons.length > 0
      ? buttons.map((button, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the buttons are passed as a fixed list.
          <Fragment key={index}>{button}</Fragment>
        ))
      : null;
  const topbarButtons = isMobile ? null : pageButtons;
  const headButtons = isMobile ? pageButtons : null;

  return (
    <div className={cn('flex min-h-full flex-col', className)} style={style}>
      <header className="sticky top-0 z-10 flex h-topbar shrink-0 items-center justify-between gap-4 border-b bg-background px-gutter">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <Breadcrumb>
            <BreadcrumbList className="text-foreground">
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are a fixed path; labels may repeat.
                  <Fragment key={index}>
                    <UIBreadcrumbItem className={cn(!isLast && 'hidden md:inline-flex')}>
                      {item.href && !isLast ? (
                        <BreadcrumbLink
                          render={<Link to={item.href} />}
                          className="underline-offset-4 hover:underline"
                        >
                          {item.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      )}
                    </UIBreadcrumbItem>
                    {!isLast && (
                      <BreadcrumbSeparator className="hidden px-0.5 md:inline-flex">
                        /
                      </BreadcrumbSeparator>
                    )}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        {(topbarActions || topbarButtons) && (
          <div className="flex shrink-0 items-center gap-3">
            {topbarActions}
            {topbarButtons}
          </div>
        )}
      </header>
      {current && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-gutter pt-gutter pb-1">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-page-title">
              {title !== undefined ? title : current.label || '...'}
            </h1>
            <title>{current.label || '...'}</title>
            {description && (
              <p className="max-w-2xl text-sm text-balance text-muted-foreground">{description}</p>
            )}
          </div>
          {(controls || headButtons) && (
            <div className="flex flex-wrap items-center gap-2">
              {controls}
              {headButtons}
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
