import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from '@core/lib/utils';
import type * as React from 'react';

const fieldClasses =
  'w-full min-w-0 rounded-lg border border-input bg-background text-base text-foreground transition-colors outline-none placeholder:text-placeholder selection:bg-primary selection:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled read-only:bg-muted read-only:text-muted-foreground aria-invalid:border-warning md:text-sm';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        fieldClasses,
        'h-control px-3 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { fieldClasses, Input };
