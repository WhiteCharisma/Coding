import type { SelfUser } from '@creator-network/shared';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { AuthLayout } from './AuthLayout';

type State = 'working' | 'done' | 'failed';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const status = useSession((s) => s.status);
  const [state, setState] = useState<State>(token ? 'working' : 'failed');
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: never submit twice (React StrictMode runs effects twice in development).
    if (!token || started.current) return;
    started.current = true;
    api
      .post('/api/auth/verify-email', { token })
      .then(async () => {
        setState('done');
        // Refresh the signed-in user so the "confirm your email" banner disappears.
        if (useSession.getState().status === 'authenticated') {
          const { user } = await api.get<{ user: SelfUser }>('/api/auth/session', { quiet401: true });
          useSession.getState().setUser(user);
        }
      })
      .catch(() => setState((s) => (s === 'done' ? s : 'failed')));
  }, [token]);

  return (
    <AuthLayout title={t('auth.verify.title')}>
      {state === 'working' && (
        <p role="status" className="flex items-center gap-3 text-fg-2">
          <Spinner className="text-accent" /> {t('auth.verify.working')}
        </p>
      )}
      {state === 'done' && (
        <div role="status" className="flex gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-fg-2">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <p>{t('auth.verify.done')}</p>
        </div>
      )}
      {state === 'failed' && (
        <div role="alert" className="flex gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-fg-2">
          <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />
          <p>{t('auth.verify.failed')}</p>
        </div>
      )}
      {state !== 'working' && (
        <Button asChild variant="primary" size="lg" className="mt-6 w-full">
          <Link to={status === 'authenticated' ? '/home' : '/login'}>{status === 'authenticated' ? t('auth.verify.continue') : t('auth.login.submit')}</Link>
        </Button>
      )}
    </AuthLayout>
  );
}
