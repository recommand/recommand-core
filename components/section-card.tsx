import { Card } from '@core/components/ui/card';
import { cn } from '@core/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A titled panel with an optional description and a right-aligned action slot.
 * Use it to wrap a table, a chart, or any block that needs a header the plain
 * Card/CardHeader pair cannot carry (filters and buttons live in `action`).
 *
 * Children are rendered unpadded so tables can run edge to edge; pass padding
 * on the child, or use `contentClassName`.
 */
export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Filters, buttons or badges, aligned right in the header. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      <div className="flex flex-col gap-3 px-5 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <div>
            <h3 className="text-base font-title">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className={contentClassName}>{children}</div>
    </Card>
  );
}
