import { Card, CardContent } from '@core/components/ui/card';
import { cn } from '@core/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A key figure: one number, its label, and optionally a line of context and
 * an icon. Use it anywhere a page opens with a row of counts.
 *
 * Tone colours the value and icon only; the card stays neutral, so a row of
 * tiles reads as one row rather than as competing panels. Use a tone when the
 * number carries a state (`success` for the outcome people are after,
 * `danger` for something that needs attention, shown in the warning colour);
 * leave it neutral when it is just a count. `progress` and `data` are kept
 * for existing callers and render neutral.
 */
export type StatTone = 'neutral' | 'progress' | 'success' | 'danger' | 'data';

const toneClasses: Record<StatTone, string> = {
  neutral: '',
  progress: '',
  success: 'text-success',
  danger: 'text-warning-foreground',
  data: '',
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
    <Card className={cn('gap-0 py-0', className)}>
      <CardContent className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-table-head text-muted-foreground [text-transform:var(--table-head-transform)]">
              {label}
            </div>
            <div className={cn('mt-2 text-kpi', toneClasses[tone])}>{value}</div>
            {detail && <div className="mt-1.5 text-xs text-muted-foreground">{detail}</div>}
          </div>
          {Icon && (
            <Icon
              className={cn(
                'size-4 shrink-0',
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
  return (
    <div className={cn('grid grid-cols-2 gap-card-gap md:grid-cols-4', className)}>{children}</div>
  );
}
