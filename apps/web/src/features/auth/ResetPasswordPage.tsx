import { LIMITS } from '@creator-network/shared';
import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage, fieldError } from '../../lib/api';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/input';
import { AuthLayout, FormError } from './AuthLayout';
import { StrengthMeter } from './RegisterPage';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      // The server revokes every session of the account, including this browser's.
      useSession.getState().signedOut();
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title={t('auth.reset.title')}>
        <FormError message={t('auth.reset.missingToken')} />
        <p className="mt-6 text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-accent-text hover:underline">
            {t('auth.forgot.title')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.reset.title')}>
      {done ? (
        <div className="flex flex-col gap-6">
          <div role="status" className="flex gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-fg-2">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <p>{t('auth.reset.done')}</p>
          </div>
          <Button asChild variant="primary" size="lg">
            <Link to="/login">{t('auth.login.submit')}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <FormError message={error !== null && !fieldError(error, 'password') ? errorMessage(error) : null} />
          <Field label={t('auth.reset.password')} hint={t('auth.register.passwordHint')} error={fieldError(error, 'password')}>
            {(p) => (
              <div className="flex flex-col gap-2">
                <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={LIMITS.passwordMin} maxLength={LIMITS.passwordMax} required autoFocus />
                <StrengthMeter password={password} />
              </div>
            )}
          </Field>
          <Field label={t('auth.reset.confirm')} error={mismatch ? t('auth.reset.mismatch') : undefined}>
            {(p) => <Input {...p} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={password.length < LIMITS.passwordMin || confirm !== password}>
            {t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
