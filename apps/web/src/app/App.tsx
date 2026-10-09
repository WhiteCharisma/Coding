import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from '../components/ui/toast';
import { TooltipProvider } from '../components/ui/tooltip';
import { queryClient } from '../lib/queryClient';
import { useSession } from '../stores/session';
import { ErrorBoundary } from './ErrorBoundary';
import { PublicOnly, SessionBoot } from './guards';
import { FullscreenSpinner, NotFoundPage } from './misc';

// Route-level code splitting. Public pages (welcome, sign-in, invites) load without the
// signed-in app; the app shell, chat and real-time client load once the user is signed in.
const RequireAuth = lazy(() => import('./RequireAuth'));
const AppShell = lazy(() => import('../features/shell/AppShell').then((m) => ({ default: m.AppShell })));
const HomePage = lazy(() => import('../features/home/HomePage').then((m) => ({ default: m.HomePage })));
const ChannelPage = lazy(() =>
  import('../features/community/CommunityPages').then((m) => ({ default: m.ChannelPage })),
);
const CommunityIndexPage = lazy(() =>
  import('../features/community/CommunityPages').then((m) => ({ default: m.CommunityIndexPage })),
);
const DmIndexPage = lazy(() => import('../features/dm/DmPages').then((m) => ({ default: m.DmIndexPage })));
const DmPage = lazy(() => import('../features/dm/DmPages').then((m) => ({ default: m.DmPage })));
const WelcomePage = lazy(() => import('../features/auth/WelcomePage'));
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../features/auth/VerifyEmailPage'));
const InvitePage = lazy(() => import('../features/auth/InvitePage'));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage'));
const ExplorePage = lazy(() => import('../features/explore/ExplorePage'));
const CommunitiesPage = lazy(() => import('../features/explore/CommunitiesPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const SearchPage = lazy(() => import('../features/search/SearchPage'));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const AdminPage = lazy(() => import('../features/admin/AdminPage'));

function RootRedirect() {
  const status = useSession((s) => s.status);
  if (status === 'loading') return <FullscreenSpinner />;
  return <Navigate to={status === 'authenticated' ? '/home' : '/welcome'} replace />;
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={450} skipDelayDuration={150}>
          <BrowserRouter>
            <SessionBoot />
            <Suspense fallback={<FullscreenSpinner />}>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route element={<PublicOnly />}>
                  <Route path="/welcome" element={<WelcomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                </Route>
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/invite/:code" element={<InvitePage />} />
                <Route element={<RequireAuth />}>
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route element={<AppShell />}>
                    <Route path="/home" element={<HomePage />} />
                    <Route path="/explore" element={<ExplorePage />} />
                    <Route path="/communities" element={<CommunitiesPage />} />
                    <Route path="/c/:communityId" element={<CommunityIndexPage />} />
                    <Route path="/c/:communityId/:channelId" element={<ChannelPage />} />
                    <Route path="/dm" element={<DmIndexPage />} />
                    <Route path="/dm/:channelId" element={<DmPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/u/:username" element={<ProfilePage />} />
                    <Route path="/settings/:section?" element={<SettingsPage />} />
                    <Route path="/admin/:section?" element={<AdminPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
