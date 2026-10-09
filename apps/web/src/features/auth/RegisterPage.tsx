import { LIMITS, type SelfUser } from '@creator-network/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { api, ApiError, errorMessage, fieldError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/input';
import { AuthLayout, FormError } from './AuthLayout';

/** Rough, local-only strength hint. The server enforces the real rules (length, not containing the username/email). */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  if (pw.length < LIMITS.passwordMin) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const unique = new Set(pw).size;
  if (unique < 5) return 1;
  if (pw.length >= 16 || (pw.length >= 12 && classes >= 3)) return 3;
  return 2;
}

export function StrengthMeter({ password }: { password: string }) {
  const level = passwordStrength(password);
  if (level === 0) return null;
  const label =
    level === 1
      ? t('auth.register.strength.weak')
      : level === 2
        ? t('auth.register.strength.okay')
        : t('auth.register.strength.strong');
  const tone = level === 1 ? 'bg-danger' : level === 2 ? 'bg-warning' : 'bg-success';
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-[var(--dur-base)]',
              i <= level ? tone : 'bg-line',
            )}
          />
        ))}
      </div>
      <span className="w-14 text-right text-xs text-fg-muted">{label}</span>
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const config = useSession((s) => s.config);
  const inviteFromLink = params.get('invite') ?? '';
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(inviteFromLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mode = config?.registrationMode ?? 'open';
  // In invite-only mode, a registration invite or a community invite link unlocks sign-up.
  const needsInvite = mode === 'invite';
  const closed = mode === 'closed';

  // Suggest a username from the display name until the user edits it themselves.
  const suggested = useMemo(
    () =>
      displayName
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, LIMITS.usernameMax),
    [displayName],
  );
  const effectiveUsername = usernameTouched ? username : suggested;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: SelfUser }>('/api/auth/register', {
        displayName,
        username: effectiveUsername,
        email,
        password,
        inviteCode: inviteCode.trim() || undefined,
      });
      useSession.getState().setUser(user);
      const code = inviteCode.trim() || inviteFromLink;
      void navigate(code ? `/onboarding?invite=${encodeURIComponent(code)}` : '/onboarding', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const generalError =
    error !== null && !['displayName', 'username', 'email', 'password', 'inviteCode'].some((f) => fieldError(error, f))
      ? error instanceof ApiError && error.code === 'username_taken'
        ? null
        : errorMessage(error)
      : null;
  const usernameError =
    fieldError(error, 'username') ??
    (error instanceof ApiError && error.code === 'username_taken' ? error.message : undefined);

  if (closed) {
    return (
      <AuthLayout title={t('auth.register.title')}>
        <p className="tile p-4 text-fg-2">{t('auth.register.closed')}</p>
        <p className="mt-6 text-center text-sm text-fg-muted">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-accent-text hover:underline">
            {t('auth.register.signIn')}
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.register.title')} subtitle={t('auth.register.subtitle')}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate data-testid="register-form">
        <FormError message={generalError} />
        <Field
          label={t('auth.register.displayName')}
          hint={t('auth.register.displayNameHint')}
          error={fieldError(error, 'displayName')}
        >
          {(p) => (
            <Input
              {...p}
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={LIMITS.displayNameMax}
              autoComplete="name"
              required
              autoFocus
            />
          )}
        </Field>
        <Field label={t('auth.register.username')} hint={t('auth.register.usernameHint')} error={usernameError}>
          {(p) => (
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted">
                @
              </span>
              <Input
                {...p}
                name="username"
                className="pl-7"
                value={effectiveUsername}
                onChange={(e) => {
                  setUsernameTouched(true);
                  setUsername(e.target.value.toLowerCase());
                }}
                maxLength={LIMITS.usernameMax}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
          )}
        </Field>
        <Field label={t('auth.register.email')} hint={t('auth.register.emailHint')} error={fieldError(error, 'email')}>
          {(p) => (
            <Input
              {...p}
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          )}
        </Field>
        <Field
          label={t('auth.register.password')}
          hint={t('auth.register.passwordHint')}
          error={fieldError(error, 'password')}
        >
          {(p) => (
            <div className="flex flex-col gap-2">
              <Input
                {...p}
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={LIMITS.passwordMin}
                maxLength={LIMITS.passwordMax}
                required
              />
              <StrengthMeter password={password} />
            </div>
          )}
        </Field>
        {(needsInvite || inviteFromLink) && (
          <Field
            label={t('auth.register.inviteCode')}
            hint={needsInvite ? t('auth.register.inviteCodeHint') : undefined}
            error={fieldError(error, 'inviteCode')}
          >
            {(p) => (
              <Input
                {...p}
                name="inviteCode"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                required={needsInvite}
              />
            )}
          </Field>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={busy}
          disabled={
            !displayName.trim() ||
            effectiveUsername.length < LIMITS.usernameMin ||
            !email ||
            password.length < LIMITS.passwordMin ||
            (needsInvite && !inviteCode.trim())
          }
        >
          {t('auth.register.submit')}
        </Button>
        <p className="text-xs text-fg-muted">{t('auth.register.terms')}</p>
        <p className="text-center text-sm text-fg-muted">
          {t('auth.register.haveAccount')}{' '}
          <Link
            to={inviteFromLink ? `/login?next=${encodeURIComponent(`/invite/${inviteFromLink}`)}` : '/login'}
            className="font-medium text-accent-text hover:underline"
          >
            {t('auth.register.signIn')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
