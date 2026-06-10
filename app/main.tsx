import React, { useEffect, useMemo } from 'react'
import { toast, Toaster } from '../components/ui/sonner';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { routes } from 'virtual:recommand-file-based-router'
import './index.css'
import { useMenuItemActions } from '@core/lib/menu-store';
import { useTranslation } from '@core/hooks/use-translation';
import { KeyRound, LogOut, Moon, Sun, User, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useUserStore } from '@core/lib/user-store';

const renderRoute = (r: typeof routes[number]) => {
    return (
        <Route
            key={r.route}
            path={r.route}
            element={r.LayoutComponent ? <r.LayoutComponent /> : null}
        >
            {r.PageComponent ? <Route index element={<r.PageComponent />} /> : null}
            {r.children.map((child) => renderRoute(child))}
        </Route>
    )
}

export default function Main({ children }: { children: React.ReactNode }) {
    const { registerMenuItem } = useMenuItemActions();
    const logout = useUserStore(state => state.logout);
    const user = useUserStore(state => state.user);
    const { theme, setTheme } = useTheme();
    const { t } = useTranslation();

    useEffect(() => {

        registerMenuItem({
            id: 'user.api.api_keys',
            title: t`API Keys`,
            icon: KeyRound,
            href: '/api-keys',
        });

        registerMenuItem({
            id: 'user.api.team',
            title: t`Team`,
            icon: Users,
            href: '/team',
        });

        registerMenuItem({
            id: 'user.session.account',
            title: t`Account`,
            icon: User,
            href: '/account',
        });

        registerMenuItem({
            id: 'user.session.theme',
            title: theme === 'dark' ? 'Light mode' : 'Dark mode',
            icon: theme === 'dark' ? Sun : Moon,
            onClick: () => {
                setTheme(theme === 'dark' ? 'light' : 'dark');
            }
        });

        registerMenuItem({
            id: 'user.session.logout',
            title: t`Logout`,
            icon: LogOut,
            onClick: async () => {
                try {
                    await logout();
                    toast.success(t`Logged out successfully`);
                } catch (error) {
                    toast.error(t`Failed to log out`);
                }
            }
        });

    }, [logout, user, theme, setTheme, t]);

    return <BrowserRouter>
        {children}
        <RouterInner />
        <Toaster richColors />
    </BrowserRouter>;
}

function getPublicPaths(routeTree: typeof routes[number][]) {
    const publicPaths: string[] = [];
    for (const route of routeTree) {
        if (route.relativePath.startsWith("app/(public)/")) {
            publicPaths.push(route.route);
        }
        if (route.children.length > 0) {
            const childrenPaths = getPublicPaths(route.children);
            publicPaths.push(...childrenPaths);
        }
    }
    return publicPaths;
}

function TranslationLoader() {
    useTranslation();
    return null;
}

const RouterInner = () => {
    const { user, isLoading, fetchUser } = useUserStore();
    const location = useLocation();
    const navigate = useNavigate();

    const publicPaths = useMemo(() => getPublicPaths(routes), [routes]);

    useEffect(() => {
        // On mount, get the current user
        fetchUser();
    }, [])

    useEffect(() => {
        if (!isLoading && !user) {
            // If not on a public route, redirect to login
            if (!publicPaths.some(route => location.pathname.startsWith(route))) {
                console.log("Redirecting to login");
                navigate("/login");
            }
        }
    }, [user, isLoading]);

    return <>
        <TranslationLoader />
        <Routes>
            {routes.map((route) => renderRoute(route))}
        </Routes>
    </>
}
