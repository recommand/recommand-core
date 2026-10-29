import { AppSidebar } from '@core/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@core/components/ui/sidebar';
import { useSidebarOpen } from '@core/hooks/use-sidebar-open';
import { useUser } from '@core/hooks/user';
import { useUncompletedOnboardingSteps } from '@core/lib/onboarding-store';
import { useUIConfig } from '@core/lib/ui-config-store';
import { Outlet } from 'react-router';
import Onboarding from './onboarding';

export default function Layout() {
  const sidebarOpen = useSidebarOpen();
  const user = useUser();
  const onboardingSteps = useUncompletedOnboardingSteps();
  // One of the theme's sidebar themes, set by the app through the
  // `sidebar.theme` UI config; without it the sidebar takes the theme's default.
  const sidebarTheme = useUIConfig<string | undefined>('sidebar.theme', undefined);

  if (user && onboardingSteps.length > 0) {
    return <Onboarding step={onboardingSteps[0]} />;
  }

  return (
    <SidebarProvider {...sidebarOpen} theme={sidebarTheme}>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
