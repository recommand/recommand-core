import { useState } from 'react';

const SIDEBAR_STATE_KEY = 'sidebar_state';

// The sidebar's open state, remembered across reloads and shared by every
// layout that renders a `SidebarProvider`. Spread the result into it.
export function useSidebarOpen() {
  const [open, setOpen] = useState(() => localStorage.getItem(SIDEBAR_STATE_KEY) !== 'closed');

  return {
    open,
    onOpenChange: (next: boolean) => {
      localStorage.setItem(SIDEBAR_STATE_KEY, next ? 'open' : 'closed');
      setOpen(next);
    },
  };
}
