import {
  REGISTRATION_MODES,
  type AuditEventDTO,
  type CommunitySummary,
  type PublicConfig,
  type RegistrationMode,
  type UserSummary,
} from '@creator-network/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, Landmark, ScrollText, Search, Ticket, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { t, tMaybe } from '../../i18n';
import { api, errorMessage, fieldError } from '../../lib/api';
import { formatBytes, formatDate, formatDateTime, formatRelative } from '../../lib/format';
import { useSession } from '../../stores/session';
import { copyText } from '../chat/actions';
import { SettingsCard } from '../settings/parts';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { Badge, DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { EmptyState } from '../../components/ui/empty-state';
import { Field, Input, Textarea } from '../../components/ui/input';
import { Segmented } from '../../components/ui/segmented';
import { Skeleton } from '../../components/ui/skeleton';
import { Switch } from '../../components/ui/switch';
import { toast } from '../../components/ui/toast';
import { UserAvatar } from '../../components/user/UserAvatar';
import type { AdminOverview } from './OverviewSection';

/* ------------------------------------------------------------ Communities */

type AdminCommunity = CommunitySummary & { owner: UserSummary };

export function CommunitiesSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [target, setTarget] = useState<AdminCommunity | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);
  const list = useQuery({
    queryKey: ['admin', 'communities', term],
    queryFn: () =>
      api
        .get<{ communities: AdminCommunity[] }>(`/api/admin/communities${term ? `?q=${encodeURIComponent(term)}` : ''}`)
        .then((r) => r.communities),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.communities.search')}
          aria-label={t('admin.communities.search')}
          className="pl-9"
          type="search"
        />
      </div>
      <div className="tile">
        {list.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !list.data?.length ? (
          <EmptyState icon={Landmark} title={t('admin.communities.empty')} />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <CommunityIcon name={c.name} src={c.iconUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium text-fg">
                    <span className="truncate">{c.name}</span>
                    {c.isDemo && <DemoBadge />}
                    <Badge>{c.visibility === 'public' ? t('common.labels.public') : t('common.labels.private')}</Badge>
                  </p>
                  <p className="truncate text-xs text-fg-muted">
                    {t('common.labels.members', { count: c.memberCount })} · {t('admin.communities.owner')}:{' '}
                    {c.owner.displayName} (@{c.owner.username}) · {formatDate(c.createdAt)}
                  </p>
                </div>
                {isAdmin && (
                  <Button variant="danger-ghost" size="sm" onClick={() => setTarget(c)}>
                    <Trash2 /> <span className="hidden sm:inline">{t('admin.communities.remove')}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {target && (
        <ConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setTarget(null);
              setReason('');
            }
          }}
          title={t('admin.communities.removeTitle', { name: target.name })}
          body={t('admin.communities.removeBody')}
          confirmLabel={t('admin.communities.remove')}
          danger
          onConfirm={async () => {
            await api.del(`/api/admin/communities/${target.id}`, { reason });
            toast.success(t('admin.communities.removed'));
            void qc.invalidateQueries({ queryKey: ['admin'] });
          }}
        >
          <Field label={t('admin.communities.reason')}>
            {(p) => (
              <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            )}
          </Field>
        </ConfirmDialog>
      )}
    </div>
  );
}

/* ---------------------------------------------------- Registration invites */

interface RegistrationInvite {
  code: string;
  note: string;
  maxUses: number | null;
  uses: number;
  expiresAt: number | null;
  createdAt: number;
}

export function InvitesSection() {
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [hours, setHours] = useState('168');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'registration-invites'],
    queryFn: () => api.get<{ invites: RegistrationInvite[] }>('/api/admin/registration-invites').then((r) => r.invites),
  });
  const linkFor = (code: string) => `${window.location.origin}/register?invite=${code}`;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { invite } = await api.post<{ invite: RegistrationInvite }>('/api/admin/registration-invites', {
        note,
        maxUses: maxUses.trim() ? Number(maxUses) : null,
        expiresInHours: hours.trim() ? Number(hours) : null,
      });
      setNote('');
      toast.success(t('admin.invites.created'));
      void copyText(linkFor(invite.code));
      void list.refetch();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-muted">{t('admin.invites.hint')}</p>
      <SettingsCard>
        <form onSubmit={(e) => void create(e)} className="grid gap-3 sm:grid-cols-[1fr_120px_160px_auto] sm:items-end">
          <Field label={t('admin.invites.note')} error={fieldError(error, 'note')}>
            {(p) => (
              <Input
                {...p}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder={t('admin.invites.notePlaceholder')}
              />
            )}
          </Field>
          <Field label={t('admin.invites.maxUses')} error={fieldError(error, 'maxUses')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={10000}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('admin.invites.expires')} error={fieldError(error, 'expiresInHours')}>
            {(p) => (
              <Input {...p} type="number" min={1} max={2160} value={hours} onChange={(e) => setHours(e.target.value)} />
            )}
          </Field>
          <Button type="submit" variant="primary" loading={busy}>
            <Ticket /> {t('admin.invites.create')}
          </Button>
        </form>
        {error !== null &&
          !fieldError(error, 'note') &&
          !fieldError(error, 'maxUses') &&
          !fieldError(error, 'expiresInHours') && <p className="mt-2 text-sm text-danger">{errorMessage(error)}</p>}
      </SettingsCard>
      <div className="tile">
        {list.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-12" />
          </div>
        ) : !list.data?.length ? (
          <EmptyState icon={Ticket} title={t('admin.invites.empty')} />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {list.data.map((inv) => (
              <li key={inv.code} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-fg">{inv.code}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {inv.note && <span className="text-fg-2">{inv.note} · </span>}
                    {inv.maxUses === null
                      ? t('admin.invites.usesUnlimited', { uses: inv.uses })
                      : t('admin.invites.uses', { uses: inv.uses, max: inv.maxUses })}{' '}
                    ·{' '}
                    {inv.expiresAt
                      ? t('admin.invites.expiresOn', { date: formatDateTime(inv.expiresAt) })
                      : t('admin.invites.noExpiry')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.actions.copyLink')}
                  onClick={() => void copyText(linkFor(inv.code))}
                >
                  <Copy />
                </Button>
                <Button variant="danger-ghost" size="sm" onClick={() => setRevoke(inv.code)}>
                  {t('common.actions.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={t('admin.invites.revokeTitle', { code: revoke ?? '' })}
        confirmLabel={t('common.actions.revoke')}
        danger
        onConfirm={async () => {
          await api.del(`/api/admin/registration-invites/${revoke}`);
          void list.refetch();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------- Instance settings */

interface InstanceSettings {
  registrationMode: RegistrationMode;
  requireEmailVerification: boolean;
  maxUploadMb: number;
  communityCreation: 'everyone' | 'admins';
  appealContact: string;
  instanceName: string;
  welcomeMessage: string;
}

interface SettingsResponse {
  settings: InstanceSettings;
  hardLimits: { maxUploadMb: number };
  email: { enabled: boolean; transport: string };
}

function SettingsForm({ data, onSaved }: { data: SettingsResponse; onSaved: () => void }) {
  const [form, setForm] = useState<InstanceSettings>(data.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);
  const set = <K extends keyof InstanceSettings>(k: K, v: InstanceSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ settings: InstanceSettings; config: PublicConfig }>('/api/admin/settings', form);
      useSession.getState().setConfig(res.config);
      setForm(res.settings);
      toast.success(t('admin.settings.saved'));
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <SettingsCard title={t('admin.settings.registration')}>
        <div role="radiogroup" aria-label={t('admin.settings.registration')} className="flex flex-col gap-2">
          {REGISTRATION_MODES.map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-ui text-fg-2 has-[:checked]:border-accent-border has-[:checked]:bg-accent-soft has-[:checked]:text-fg"
            >
              <input
                type="radio"
                name="registration-mode"
                checked={form.registrationMode === m}
                onChange={() => set('registrationMode', m)}
                className="size-4 accent-[var(--accent)]"
              />
              {t(`admin.settings.registrationModes.${m}`)}
            </label>
          ))}
        </div>
        <Switch
          className="mt-3"
          checked={form.requireEmailVerification}
          onCheckedChange={(v) => set('requireEmailVerification', v)}
          disabled={!data.email.enabled}
          label={t('admin.settings.requireVerification')}
          description={t('admin.settings.requireVerificationHint')}
        />
      </SettingsCard>
      <SettingsCard>
        <div className="flex flex-col gap-4">
          <Field label={t('admin.settings.instanceName')} error={fieldError(error, 'instanceName')}>
            {(p) => (
              <Input
                {...p}
                value={form.instanceName}
                onChange={(e) => set('instanceName', e.target.value)}
                maxLength={40}
              />
            )}
          </Field>
          <Field
            label={t('admin.settings.welcomeMessage')}
            hint={t('admin.settings.welcomeMessageHint')}
            error={fieldError(error, 'welcomeMessage')}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={form.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                maxLength={300}
              />
            )}
          </Field>
          <Field
            label={t('admin.settings.appealContact')}
            hint={t('admin.settings.appealContactHint')}
            error={fieldError(error, 'appealContact')}
          >
            {(p) => (
              <Input
                {...p}
                value={form.appealContact}
                onChange={(e) => set('appealContact', e.target.value)}
                maxLength={200}
              />
            )}
          </Field>
          <Field
            label={t('admin.settings.maxUpload')}
            hint={t('admin.settings.maxUploadHint', { max: data.hardLimits.maxUploadMb })}
            error={fieldError(error, 'maxUploadMb')}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={data.hardLimits.maxUploadMb}
                value={form.maxUploadMb}
                onChange={(e) => set('maxUploadMb', Number(e.target.value))}
                className="max-w-40"
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg-2">{t('admin.settings.communityCreation')}</span>
            <Segmented<'everyone' | 'admins'>
              label={t('admin.settings.communityCreation')}
              value={form.communityCreation}
              onChange={(v) => set('communityCreation', v)}
              options={[
                { value: 'everyone', label: t('admin.settings.creationEveryone') },
                { value: 'admins', label: t('admin.settings.creationAdmins') },
              ]}
              className="self-start"
            />
          </div>
        </div>
      </SettingsCard>
      {error !== null &&
        !['instanceName', 'welcomeMessage', 'appealContact', 'maxUploadMb'].some((k) => fieldError(error, k)) && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorMessage(error)}
          </p>
        )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={!dirty || busy} onClick={() => setForm(data.settings)}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
          {t('common.actions.saveChanges')}
        </Button>
      </div>
    </form>
  );
}

export function InstanceSettingsSection() {
  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/api/admin/settings'),
  });
  if (query.isError) return <p className="text-sm text-danger">{errorMessage(query.error)}</p>;
  if (!query.data) return <Skeleton className="h-96 rounded-xl" />;
  return (
    <SettingsForm key={JSON.stringify(query.data.settings)} data={query.data} onSaved={() => void query.refetch()} />
  );
}

/* ----------------------------------------------------------------- Backups */

interface BackupItem {
  file: string;
  bytes: number;
  createdAt: number;
}

export function BackupsSection({ overview }: { overview: AdminOverview | undefined }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api.get<{ backups: BackupItem[] }>('/api/admin/backups').then((r) => r.backups),
  });
  const create = async () => {
    setBusy(true);
    try {
      const { backup } = await api.post<{ backup: BackupItem }>('/api/admin/backups');
      toast.success(t('admin.backups.created', { file: backup.file }));
      void list.refetch();
      void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const interval = overview?.backups.intervalHours;
  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <p className="text-sm text-fg-2">{t('admin.backups.hint')}</p>
        {interval !== undefined && (
          <p className="mt-2 text-sm text-fg-muted">
            {interval > 0 ? t('admin.backups.automatic', { hours: interval }) : t('admin.backups.automaticOff')}
          </p>
        )}
        <p className="mt-2 text-sm text-fg-muted">{t('admin.backups.restoreHint')}</p>
        <Button
          variant="primary"
          className="mt-4"
          loading={busy}
          onClick={() => void create()}
          data-testid="create-backup"
        >
          <Archive /> {t('admin.backups.create')}
        </Button>
      </SettingsCard>
      <div className="tile">
        {list.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-12" />
          </div>
        ) : !list.data?.length ? (
          <EmptyState icon={Archive} title={t('admin.backups.empty')} />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {list.data.map((b) => (
              <li key={b.file} className="flex items-center gap-3 px-4 py-3">
                <Archive className="size-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{b.file}</span>
                <span className="text-xs whitespace-nowrap text-fg-muted">{formatBytes(b.bytes)}</span>
                <span className="hidden text-xs whitespace-nowrap text-fg-muted sm:inline">
                  {formatDateTime(b.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Audit */

export function auditActionText(e: AuditEventDTO): string {
  const target = e.targetLabel ?? e.targetId ?? '';
  return (
    tMaybe(`admin.audit.actions.${e.action}`, { target }) ?? t('admin.audit.actions.fallback', { action: e.action })
  );
}

export function AuditSection() {
  const list = useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api
        .get<{ events: AuditEventDTO[] }>(`/api/admin/audit${pageParam ? `?before=${pageParam}` : ''}`)
        .then((r) => r.events),
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]?.createdAt : undefined),
  });
  const events = list.data?.pages.flat() ?? [];
  if (list.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (events.length === 0) return <EmptyState icon={ScrollText} title={t('admin.audit.empty')} />;
  return (
    <div className="flex flex-col gap-4">
      <ol className="divide-y divide-line-subtle tile" data-testid="admin-audit">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-4 py-3">
            {e.actor ? (
              <UserAvatar name={e.actor.displayName} src={e.actor.avatarUrl} size="sm" />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-active text-[10px] text-fg-muted">
                CLI
              </span>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-fg-2">
                <span className="font-semibold text-fg">{e.actor?.displayName ?? t('admin.audit.system')}</span>{' '}
                {auditActionText(e)}
              </p>
              {e.reason && <p className="mt-0.5 text-xs text-fg-muted">“{e.reason}”</p>}
            </div>
            <time
              className="text-xs whitespace-nowrap text-fg-muted"
              dateTime={new Date(e.createdAt).toISOString()}
              title={formatDateTime(e.createdAt)}
            >
              {formatRelative(e.createdAt)}
            </time>
          </li>
        ))}
      </ol>
      {list.hasNextPage && (
        <Button className="self-center" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {t('common.actions.loadMore')}
        </Button>
      )}
    </div>
  );
}
