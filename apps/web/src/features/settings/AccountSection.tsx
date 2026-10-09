import { LIMITS, type SelfUser, type SessionInfo } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, LogOut, MailWarning, Monitor, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { api, ApiError, errorMessage, fieldError } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { useSession } from '../../stores/session';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { Field, Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { StrengthMeter } from '../auth/RegisterPage';
import { describeUserAgent, SectionHeader, SettingsCard } from './parts';

function ChangeEmail({ user }: { user: SelfUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ user: SelfUser }>('/api/auth/change-email', { email, password });
      useSession.getState().setUser(res.user);
      setEmail('');
      setPassword('');
      toast.success(t('settings.account.emailChanged'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.account.newEmail')} error={fieldError(error, 'email')}>
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder={user.email} />}
        </Field>
        <Field label={t('settings.account.currentPassword')} error={fieldError(error, 'password')}>
          {(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
        </Field>
      </div>
      {error !== null && !fieldError(error, 'email') && !fieldError(error, 'password') && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
      <div>
        <Button type="submit" loading={busy} disabled={!email.includes('@') || !password}>
          {t('settings.account.changeEmail')}
        </Button>
      </div>
    </form>
  );
}

function ChangePassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setCurrent('');
      setNew('');
      toast.success(t('settings.account.passwordChanged'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.account.currentPassword')} error={fieldError(error, 'currentPassword')}>
          {(p) => <Input {...p} type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />}
        </Field>
        <Field label={t('settings.account.newPassword')} error={fieldError(error, 'newPassword')}>
          {(p) => (
            <div className="flex flex-col gap-2">
              <Input {...p} type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" maxLength={LIMITS.passwordMax} />
              <StrengthMeter password={newPassword} />
            </div>
          )}
        </Field>
      </div>
      {error !== null && !fieldError(error, 'currentPassword') && !fieldError(error, 'newPassword') && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
      <div>
        <Button type="submit" loading={busy} disabled={!currentPassword || newPassword.length < LIMITS.passwordMin}>
          {t('settings.account.changePassword')}
        </Button>
      </div>
    </form>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteMessages, setDeleteMessages] = useState(false);
  return (
    <SettingsCard title={t('settings.account.deleteTitle')} description={t('settings.account.deleteBody')} tone="danger">
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t('settings.account.deleteButton')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPassword('');
        }}
        title={t('settings.account.deleteConfirmTitle')}
        body={t('settings.account.deleteBody')}
        confirmLabel={t('settings.account.deleteButton')}
        danger
        confirmDisabled={!password}
        onConfirm={async () => {
          try {
            await api.del('/api/me', { password, deleteMessages });
          } catch (err) {
            if (err instanceof ApiError && err.code === 'owns_communities') {
              const names = ((err.details as { communities?: { name: string }[] } | undefined)?.communities ?? []).map((c) => c.name).join(', ');
              throw new Error(t('settings.account.ownsCommunities', { names }), { cause: err });
            }
            throw err;
          }
          useSession.getState().signedOut();
          void navigate('/welcome', { replace: true });
        }}
      >
        <Field label={t('settings.account.currentPassword')}>{(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" checked={deleteMessages} onChange={(e) => setDeleteMessages(e.target.checked)} className="size-4 accent-[var(--danger)]" />
          {t('settings.account.deleteMessages')}
        </label>
      </ConfirmDialog>
    </SettingsCard>
  );
}

export function AccountSection({ user }: { user: SelfUser }) {
  const config = useSession((s) => s.config);
  const [resent, setResent] = useState(false);
  const resend = async () => {
    try {
      await api.post('/api/auth/verify-email/resend');
      setResent(true);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('settings.account.title')} />
      <SettingsCard>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-fg-2">{t('settings.account.username')}</dt>
            <dd className="mt-1 font-mono text-fg">@{user.username}</dd>
            <dd className="mt-0.5 text-xs text-fg-muted">{t('settings.account.usernameHint')}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-fg-2">{t('settings.account.email')}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-fg">
              <span className="break-all">{user.email}</span>
              {user.emailVerified ? (
                <Badge tone="success">
                  <BadgeCheck className="size-3" /> {t('settings.account.verified')}
                </Badge>
              ) : (
                <Badge tone="warning">
                  <MailWarning className="size-3" /> {t('settings.account.unverified')}
                </Badge>
              )}
            </dd>
            {!user.emailVerified && config?.emailEnabled && (
              <dd className="mt-2">
                {resent ? (
                  <span className="text-sm text-success">{t('auth.verify.resent')}</span>
                ) : (
                  <Button size="sm" variant="link" onClick={() => void resend()}>
                    {t('settings.account.resend')}
                  </Button>
                )}
              </dd>
            )}
          </div>
        </dl>
      </SettingsCard>
      <SettingsCard title={t('settings.account.changeEmail')}>
        <ChangeEmail user={user} />
      </SettingsCard>
      <SettingsCard title={t('settings.account.changePassword')}>
        <ChangePassword />
      </SettingsCard>
      <DeleteAccount />
    </div>
  );
}

export function SessionsSection() {
  const navigate = useNavigate();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<{ sessions: SessionInfo[] }>('/api/auth/sessions').then((r) => r.sessions) });
  const [busy, setBusy] = useState<string | null>(null);
  const revoke = async (s: SessionInfo) => {
    setBusy(s.id);
    try {
      await api.del(`/api/auth/sessions/${s.id}`);
      if (s.current) {
        useSession.getState().signedOut();
        void navigate('/login', { replace: true });
        return;
      }
      void sessions.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const revokeOthers = async () => {
    setBusy('others');
    try {
      const { revoked } = await api.post<{ revoked: number }>('/api/auth/sessions/revoke-others');
      toast.success(t('settings.sessions.signedOutOthers', { count: revoked }));
      void sessions.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('settings.sessions.title')} subtitle={t('settings.sessions.subtitle')} />
      <SettingsCard className="p-0 sm:p-0">
        {sessions.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle" data-testid="session-list">
            {sessions.data?.map((s) => {
              const mobile = /Mobile|Android|iPhone|iPad/.test(s.userAgent);
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-inset text-fg-muted">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-ui font-medium text-fg">
                      {describeUserAgent(s.userAgent) ?? t('settings.sessions.unknownDevice')}
                      {s.current && <Badge tone="accent">{t('settings.sessions.current')}</Badge>}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {s.ip ? `${s.ip} · ` : ''}
                      {t('settings.sessions.lastActive', { time: formatRelative(s.lastSeenAt) })}
                    </p>
                  </div>
                  <Button size="sm" variant={s.current ? 'secondary' : 'danger-ghost'} loading={busy === s.id} onClick={() => void revoke(s)}>
                    <LogOut /> {t('settings.sessions.signOut')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>
      {others > 0 && (
        <div>
          <Button variant="danger-ghost" loading={busy === 'others'} onClick={() => void revokeOthers()}>
            {t('settings.sessions.signOutOthers')}
          </Button>
        </div>
      )}
    </div>
  );
}
