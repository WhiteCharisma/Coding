import type { SelfUser } from '@creator-network/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/input';
import { AuthLayout, FormError } from './AuthLayout';

interface Suspension {
  reason: string;
  until: number | null;
  appealContact: string;
}

export function SuspendedNotice({ s }: { s: Suspension }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
      <p className="font-semibold text-fg">{t('auth.suspended.title')}</p>
      <p className="mt-1 text-fg-2">
        {s.until ? t('auth.suspended.until', { date: formatDate(s.until) }) : t('auth.suspended.indefinite')}
      </p>
      {s.reason && (
        <>
          <p className="mt-2 text-fg-muted">{t('auth.suspended.reason')}</p>
          <p className="mt-0.5 text-fg">“{s.reason}”</p>
        </>
      )}
      <p className="mt-3 text-fg-2">
        {s.appealContact ? t('auth.suspended.appeal', { contact: s.appealContact }) : t('auth.suspended.appealGeneric')}
      </p>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ended = useSession((s) => s.endedReason);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suspension, setSuspension] = useState<Suspension | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuspension(null);
    try {
      const { user } = await api.post<{ user: SelfUser }>('/api/auth/login', { login, password });
      useSession.getState().setUser(user);
      const next = params.get('next');
      void navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/home', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'account_suspended') setSuspension(err.details as Suspension);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        {ended === 'expired' && (
          <p className="rounded-lg border border-line bg-elevated px-3 py-2.5 text-sm text-fg-2">
            {t('auth.sessionExpired')}
          </p>
        )}
        {suspension && <SuspendedNotice s={suspension} />}
        <FormError message={error} />
        <Field label={t('auth.login.loginLabel')}>
          {(p) => (
            <Input
              {...p}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          )}
        </Field>
        <Field label={t('auth.login.passwordLabel')}>
          {(p) => (
            <Input
              {...p}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          )}
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link to="/forgot-password" className="text-sm text-accent-text hover:underline">
            {t('auth.login.forgot')}
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!login || !password}>
          {t('auth.login.submit')}
        </Button>
        <p className="text-center text-sm text-fg-muted">
          {t('auth.login.noAccount')}{' '}
          <Link
            to={`/register${params.get('next')?.startsWith('/invite/') ? `?invite=${params.get('next')?.split('/').pop() ?? ''}` : ''}`}
            className="font-medium text-accent-text hover:underline"
          >
            {t('auth.login.createAccount')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
