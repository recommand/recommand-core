import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cn } from '@core/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-sm border border-transparent px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        outline: 'border-border text-foreground [a]:hover:bg-accent',
        success: 'border-success-line bg-success-soft text-success',
        warning: 'border-warning-line bg-warning-soft text-warning-foreground',
        destructive: 'border-destructive-soft bg-background text-destructive',
        /** A type tag, such as the kind of a rule or webhook. */
        tag: 'border-border px-1 text-micro font-semibold text-muted-foreground uppercase',
        /** A count. */
        counter: 'h-auto min-w-5 bg-secondary px-1.5 py-0.5 text-micro text-secondary-foreground',
        /** A count of items that need action. */
        'counter-action': 'h-auto min-w-5 bg-warning px-1.5 py-0.5 text-micro text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: 'badge', variant },
  });
}

export { Badge, badgeVariants };
