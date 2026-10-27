import { cn } from '@core/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

/**
 * A square that shows the state of something. The shape says how far it is,
 * the tone whether it is in order:
 *
 * - shape: `filled` (done), `half` (under way or waiting), `outline` (not
 *   started), `unknown` (unknown or not applicable, always neutral);
 * - tone: `normal` (in order), `positive` (the outcome the user is after),
 *   `attention` (needs attention).
 *
 * The pixel never carries meaning alone: put a label next to it.
 */
const statusPixelVariants = cva('inline-block shrink-0 border-[1.5px] border-current', {
  variants: {
    shape: {
      filled: 'bg-current',
      half: 'bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]',
      outline: 'bg-transparent',
      unknown: 'border-dashed bg-transparent text-muted-foreground',
    },
    tone: {
      normal: 'text-status-normal',
      positive: 'text-status-positive',
      attention: 'text-status-attention',
    },
    size: {
      xs: 'size-1.5',
      default: 'size-[9px]',
      lg: 'size-3',
      xl: 'size-4',
    },
  },
  compoundVariants: [{ shape: 'unknown', className: 'text-muted-foreground' }],
  defaultVariants: { shape: 'filled', tone: 'normal', size: 'default' },
});

function StatusPixel({
  className,
  shape,
  tone,
  size,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusPixelVariants>) {
  return (
    <span
      data-slot="status-pixel"
      aria-hidden="true"
      className={cn(statusPixelVariants({ shape, tone, size }), className)}
      {...props}
    />
  );
}

/** A status pixel with its label. */
function StatusLabel({
  className,
  children,
  shape,
  tone,
  size,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusPixelVariants>) {
  return (
    <span
      data-slot="status-label"
      className={cn(
        'inline-flex items-center gap-2 text-xs font-medium text-foreground',
        tone === 'attention' && 'text-warning-foreground',
        className,
      )}
      {...props}
    >
      <StatusPixel shape={shape} tone={tone} size={size} />
      {children}
    </span>
  );
}

export { StatusLabel, StatusPixel, statusPixelVariants };
