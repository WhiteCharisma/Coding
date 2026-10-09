import type { BootstrapDTO } from '@creator-network/shared';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { api, errorMessage, onUnauthorized } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { setNavigator, startRealtime, stopRealtime } from '../lib/realtime';
import { useChat } from '../stores/chat';
import { useMessages } from '../stores/messages';
import { useSession } from '../stores/session';
import { applyTheme, useUi } from '../stores/ui';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { t } from '../i18n';
import { CloudOff } from 'lucide-react';
import { FullscreenSpinner } from './misc';

/** Loads the session once, keeps the theme in sync and tears everything down on sign-out. */
export function SessionBoot() {
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    void useSession.getState().init();
    return onUnauthorized(() => useSession.getState().signedOut('expired'));
  }, []);

  useEffect(() => {
    setNavigator((to) => void navigate(to));
  }, [navigate]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => applyTheme('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    if (status === 'anonymous') {
      stopRealtime();
      useChat.getState().reset();
      useMessages.getState().reset();
      useMessages.getState().setUser(null);
      queryClient.clear();
    }
  }, [status]);
  return null;
}

/** Signed-in area: loads bootstrap data, connects the socket, enforces onboarding. */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const ready = useChat((s) => s.ready);
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !user || ready || loading.current) return;
    loading.current = true;
    useMessages.getState().setUser(user.id);
    api
      .get<BootstrapDTO>('/api/me/bootstrap')
      .then((b) => {
        useChat.getState().applyBootstrap(b);
        useSession.getState().setUser(b.user);
        useSession.getState().setConfig(b.config);
        startRealtime();
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => {
        loading.current = false;
      });
  }, [status, user, ready]);

  if (status === 'loading') return <FullscreenSpinner />;
  if (status === 'anonymous') {
    const next = location.pathname + location.search;
    return (
      <Navigate
        to={next === '/home' || next === '/' ? '/welcome' : `/login?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }
  if (error && !ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-main">
        <EmptyState
          icon={CloudOff}
          title={t('common.errors.offline')}
          body={error}
          actions={
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t('common.actions.retry')}
            </Button>
          }
        />
      </div>
    );
  }
  if (!ready || !user) return <FullscreenSpinner />;
  if (!user.onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to={`/onboarding${location.search}`} replace />;
  }
  return <Outlet />;
}

/** Pages for signed-out visitors; signed-in users are sent into the app. */
export function PublicOnly() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  // Once the page has been shown to a signed-out visitor, signing in on it (login, register)
  // is handled by that page's own navigation — redirecting here as well would race with it.
  const [shownAnonymous, setShownAnonymous] = useState(false);
  if (status === 'anonymous' && !shownAnonymous) setShownAnonymous(true);
  if (status === 'loading') return <FullscreenSpinner />;
  if (status === 'authenticated' && !shownAnonymous) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'} replace />;
  }
  return <Outlet />;
}
