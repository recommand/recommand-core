import { CircleCheckIcon, InfoIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps, toast } from 'sonner';

/**
 * Toasts on the popover surface with a 12px radius. Errors use the warning
 * icon: a failure is a status, and red is kept for destructive actions.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning-foreground" />,
        error: <TriangleAlertIcon className="size-4 text-warning-foreground" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-xl)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'shadow-lg',
          description: 'text-muted-foreground!',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
