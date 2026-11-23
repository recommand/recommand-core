import { type ComponentType, useMemo } from 'react';
import { create } from 'zustand';

// A banner that a package shows above every dashboard page, for something the
// user must not miss wherever they are. The component decides for itself
// whether there is anything to show, and renders null when there is not.
export interface DashboardBanner {
  id: string;
  component: ComponentType;
  // Lower comes first (default 0).
  order?: number;
}

interface BannerStore {
  banners: DashboardBanner[];
  registerBanner: (banner: DashboardBanner) => void;
}

const useBannerStore = create<BannerStore>((set) => ({
  banners: [],
  registerBanner: (banner: DashboardBanner) => {
    set((state) => {
      const existingIndex = state.banners.findIndex((existing) => existing.id === banner.id);
      if (existingIndex >= 0) {
        const banners = [...state.banners];
        banners[existingIndex] = banner;
        return { banners };
      }
      return { banners: [...state.banners, banner] };
    });
  },
}));

export const useBanners = (): DashboardBanner[] => {
  const banners = useBannerStore((state) => state.banners);
  return useMemo(() => [...banners].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [banners]);
};

export const useBannerActions = (): { registerBanner: (banner: DashboardBanner) => void } => {
  const registerBanner = useBannerStore((state) => state.registerBanner);
  return useMemo(() => ({ registerBanner }), [registerBanner]);
};
