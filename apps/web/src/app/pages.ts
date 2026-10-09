import { lazyWithPreload } from './lazy';

// The signed-in app, split from the public pages and preloaded (see preload.ts).
export const RequireAuth = lazyWithPreload(() => import('./RequireAuth'));
export const AppShell = lazyWithPreload(() =>
  import('../features/shell/AppShell').then((m) => ({ default: m.AppShell })),
);
export const HomePage = lazyWithPreload(() =>
  import('../features/home/HomePage').then((m) => ({ default: m.HomePage })),
);
export const ChannelPage = lazyWithPreload(() =>
  import('../features/community/CommunityPages').then((m) => ({ default: m.ChannelPage })),
);
export const CommunityIndexPage = lazyWithPreload(() =>
  import('../features/community/CommunityPages').then((m) => ({ default: m.CommunityIndexPage })),
);
export const DmIndexPage = lazyWithPreload(() =>
  import('../features/dm/DmPages').then((m) => ({ default: m.DmIndexPage })),
);
export const DmPage = lazyWithPreload(() => import('../features/dm/DmPages').then((m) => ({ default: m.DmPage })));

// Secondary pages: fetched when the browser is idle after the app has loaded.
export const ExplorePage = lazyWithPreload(() => import('../features/explore/ExplorePage'));
export const CommunitiesPage = lazyWithPreload(() => import('../features/explore/CommunitiesPage'));
export const NotificationsPage = lazyWithPreload(() => import('../features/notifications/NotificationsPage'));
export const SearchPage = lazyWithPreload(() => import('../features/search/SearchPage'));
export const ProfilePage = lazyWithPreload(() => import('../features/profile/ProfilePage'));
export const SettingsPage = lazyWithPreload(() => import('../features/settings/SettingsPage'));
export const OnboardingPage = lazyWithPreload(() => import('../features/onboarding/OnboardingPage'));
export const AdminPage = lazyWithPreload(() => import('../features/admin/AdminPage'));

export const corePages = [RequireAuth, AppShell, HomePage, ChannelPage, CommunityIndexPage, DmIndexPage, DmPage];
export const corePagesLoaded = () => corePages.every((p) => p.isLoaded());
export const loadCorePages = () => Promise.all(corePages.map((p) => p.preload()));
export const secondaryPages = [ExplorePage, CommunitiesPage, NotificationsPage, SearchPage, ProfilePage, SettingsPage];
