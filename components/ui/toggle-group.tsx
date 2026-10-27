import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { toggleVariants } from '@core/components/ui/toggle';
import { cn } from '@core/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';

type ToggleGroupVariant = VariantProps<typeof toggleVariants>['variant'] | 'segmented';

const ToggleGroupContext = React.createContext<{
  variant?: ToggleGroupVariant;
  size?: VariantProps<typeof toggleVariants>['size'];
}>({ variant: 'default', size: 'default' });

/**
 * A group of toggles. With `variant="segmented"` it is a segmented control:
 * the same track and active plate as the segmented tabs, for choices that do
 * not switch a panel. Pass `multiple` to allow more than one pressed item.
 */
function ToggleGroup({
  className,
  variant = 'default',
  size = 'default',
  children,
  ...props
}: ToggleGroupPrimitive.Props & {
  variant?: ToggleGroupVariant;
  size?: VariantProps<typeof toggleVariants>['size'];
}) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        'group/toggle-group flex w-fit flex-row items-center gap-1 rounded-lg data-[variant=segmented]:h-control data-[variant=segmented]:gap-0.5 data-[variant=segmented]:bg-muted data-[variant=segmented]:p-0.5',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  const segmented = context.variant === 'segmented';
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({
          variant: segmented ? 'default' : (variant ?? (context.variant as 'default' | 'outline')),
          size: size ?? context.size ?? 'default',
        }),
        segmented &&
          'h-full rounded-[calc(var(--radius-lg)-2px)] border border-transparent hover:bg-transparent data-pressed:border-border data-pressed:bg-background',
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
