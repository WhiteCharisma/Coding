import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage, fieldError } from '../../lib/api';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/input';
import { AuthLayout, FormError } from './AuthLayout';

export default function ForgotPasswordPage() {
  const config = useSession((s) => s.config);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <p className="mt-6 text-center text-sm">
      <Link to="/login" className="font-medium text-accent-text hover:underline">
        {t('auth.forgot.back')}
      </Link>
    </p>
  );

  if (config && !config.emailEnabled) {
    return (
      <AuthLayout title={t('auth.forgot.title')}>
        <p className="tile p-4 text-fg-2">{t('auth.forgot.unavailable')}</p>
        {config.appealContact && <p className="mt-3 text-sm text-fg-muted">{config.appealContact}</p>}
        {back}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={sent ? undefined : t('auth.forgot.subtitle')}>
      {sent ? (
        <div role="status" className="flex gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-fg-2">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-success" />
          <p>{t('auth.forgot.sent')}</p>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <FormError message={error !== null && !fieldError(error, 'email') ? errorMessage(error) : null} />
          <Field label={t('auth.forgot.email')} error={fieldError(error, 'email')}>
            {(p) => (
              <Input
                {...p}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!email.includes('@')}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
      {back}
    </AuthLayout>
  );
}
