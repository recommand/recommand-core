import { Card, CardContent } from '@core/components/ui/card';
import { cn } from '@core/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The HQ KPI tile: one number, its label, and optionally a line of context and
 * an icon. Use it anywhere a page opens with a row of counts.
 *
 * Tone accents the value and icon only - the card chrome stays neutral, so a
 * row of tiles reads as one row rather than as competing panels. Reach for a
 * tone when the number carries a state (failures are bad, deliveries are
 * good); leave it neutral when it is just a count.
 */
export type StatTone = 'neutral' | 'progress' | 'success' | 'danger' | 'data';

const toneClasses: Record<StatTone, string> = {
  neutral: '',
  progress: 'text-progress-dark',
  success: 'text-folder-dark',
  danger: 'text-danger-dark',
  data: 'text-data-dark',
};

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value - context, not a second metric. */
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
}

export function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
  className,
}: StatTileProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums', toneClasses[tone])}>
              {value}
            </div>
            {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
          </div>
          {Icon && (
            <Icon
              className={cn(
                'h-4 w-4 shrink-0',
                tone === 'neutral' ? 'text-muted-foreground' : toneClasses[tone],
              )}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Standard responsive row for StatTile. Two up on mobile, four up from md. */
export function StatTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-4 md:grid-cols-4', className)}>{children}</div>;
}
