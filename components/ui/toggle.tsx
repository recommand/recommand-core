import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cn } from '@core/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-active data-pressed:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-background',
      },
      size: {
        default: 'h-control min-w-(--spacing-control) px-3',
        sm: 'h-control-sm min-w-(--spacing-control-sm) px-2.5 text-button-sm',
        lg: 'h-control-lg min-w-(--spacing-control-lg) px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Toggle({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
