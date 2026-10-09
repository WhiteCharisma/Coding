import type { BootstrapDTO } from '@creator-network/shared';
import { CloudOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { t } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { startRealtime } from '../lib/realtime';
import { useChat } from '../stores/chat';
import { useMessages } from '../stores/messages';
import { useSession } from '../stores/session';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { FullscreenSpinner } from './misc';

/** Signed-in area: loads bootstrap data, connects the socket, enforces onboarding. */
export default function RequireAuth() {
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
