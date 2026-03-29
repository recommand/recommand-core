import { create } from 'zustand';
import { useMemo } from 'react';

interface UIConfigStore {
    configs: Record<string, unknown>;
    setUIConfig: (key: string, value: unknown) => void;
}

const useUIConfigStore = create<UIConfigStore>((set) => ({
    configs: {},
    setUIConfig: (key: string, value: unknown) => {
        set((state) => ({
            configs: { ...state.configs, [key]: value },
        }));
    },
}));

export function useUIConfig<T>(key: string, defaultValue: T): T {
    return useUIConfigStore((state) => (state.configs[key] as T) ?? defaultValue);
}

export const useUIConfigActions = () => {
    const setUIConfig = useUIConfigStore((state) => state.setUIConfig);
    return useMemo(() => ({ setUIConfig }), [setUIConfig]);
};
