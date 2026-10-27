import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@core/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
      {...props}
    />
  );
}

/**
 * `segmented` (the default) switches between views inside a page: a track of
 * `h-control` with the active segment on the page background. `line` is a row
 * of page tabs, `h-tabs` high, with the active tab underlined.
 */
const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit items-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col',
  {
    variants: {
      variant: {
        segmented: 'h-control justify-center gap-0.5 rounded-lg bg-muted p-0.5',
        line: 'h-tabs gap-6 border-b',
      },
    },
    defaultVariants: { variant: 'segmented' },
  },
);

function TabsList({
  className,
  variant = 'segmented',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Segmented: the active segment is a plate on the page background, its radius nested inside the track.
        'group-data-[variant=segmented]/tabs-list:h-full group-data-[variant=segmented]/tabs-list:flex-1 group-data-[variant=segmented]/tabs-list:rounded-[calc(var(--radius-lg)-2px)] group-data-[variant=segmented]/tabs-list:border group-data-[variant=segmented]/tabs-list:border-transparent group-data-[variant=segmented]/tabs-list:px-3 group-data-[variant=segmented]/tabs-list:data-active:border-border group-data-[variant=segmented]/tabs-list:data-active:bg-background',
        // Line: an underline in the primary colour under the active tab.
        'group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:inset-x-0 group-data-[variant=line]/tabs-list:after:-bottom-px group-data-[variant=line]/tabs-list:after:h-0.5 group-data-[variant=line]/tabs-list:after:bg-primary group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
