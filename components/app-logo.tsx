import { cn } from '@core/lib/utils';
import { appIdentity } from '@recommand/lib/app-identity-client';

/**
 * The app's logo from the deployment's app identity (`recommand.app`), with
 * the dark variant in dark mode. Pass `src` to show another image instead.
 * Without a logo it shows the app's name.
 */
export function AppLogo({ src, className }: { src?: string; className?: string }) {
  const { name, logo, logoDark } = appIdentity;

  if (src) return <img src={src} alt={name} className={className} />;

  if (!logo) {
    return <span className={cn('text-2xl font-title text-foreground', className)}>{name}</span>;
  }

  return (
    <>
      <img src={logo} alt={name} className={cn(logoDark && 'dark:hidden', className)} />
      {logoDark && <img src={logoDark} alt={name} className={cn('hidden dark:block', className)} />}
    </>
  );
}
