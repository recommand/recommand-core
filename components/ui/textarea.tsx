import { fieldClasses } from '@core/components/ui/input';
import { cn } from '@core/lib/utils';
import type * as React from 'react';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, 'flex field-sizing-content min-h-16 px-3 py-2', className)}
      {...props}
    />
  );
}

export { Textarea };
