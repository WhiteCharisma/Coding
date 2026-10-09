import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { Toaster } from '../components/ui/toast';
import { TooltipProvider } from '../components/ui/tooltip';
import { queryClient } from '../lib/queryClient';
import { useSession } from '../stores/session';
import { ErrorBoundary } from './ErrorBoundary';
import { PublicOnly, SessionBoot } from './guards';
import { FullscreenSpinner, NotFoundPage } from './misc';
import {
  AdminPage,
  AppShell,
  ChannelPage,
  CommunitiesPage,
  CommunityIndexPage,
  DmIndexPage,
  DmPage,
  ExplorePage,
  HomePage,
  loadCorePages,
  corePagesLoaded,
  NotificationsPage,
  OnboardingPage,
  ProfilePage,
  RequireAuth,
  SearchPage,
  SettingsPage,
} from './pages';

// Route-level code splitting. Public pages (welcome, sign-in, invites) load without the
// signed-in app; the signed-in pages are defined (and preloaded) in ./pages.
const WelcomePage = lazy(() => import('../features/auth/WelcomePage'));
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../features/auth/VerifyEmailPage'));
const InvitePage = lazy(() => import('../features/auth/InvitePage'));

/**
 * Entry to the signed-in area. Renders a plain spinner (instead of suspending) until the
 * session is known and the preloaded core chunks are ready, so React never shows a Suspense
 * fallback here and the app appears as soon as its data arrives.
 */
function SignedInGate() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  const [ready, setReady] = useState(corePagesLoaded);
  useEffect(() => {
    if (status !== 'authenticated' || ready) return;
    const done = () => setReady(true);
    void loadCorePages().then(done, done); // on failure, the lazy route reports the error
  }, [status, ready]);
  if (status === 'anonymous') {
    const next = location.pathname + location.search;
    return (
      <Navigate
        to={next === '/home' || next === '/' ? '/welcome' : `/login?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }
  if (status === 'loading' || !ready) return <FullscreenSpinner />;
  return <RequireAuth />;
}

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
                <Route element={<SignedInGate />}>
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
