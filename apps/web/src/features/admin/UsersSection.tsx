import { PLATFORM_ROLES, type PlatformRole } from '@creator-network/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, KeyRound, MoreHorizontal, RotateCcw, Search, Trash2, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { copyText } from '../chat/actions';
import { Badge, DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '../../components/ui/menu';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { UserAvatar } from '../../components/user/UserAvatar';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  status: 'active' | 'suspended' | 'deleted';
  suspendedUntil: number | null;
  suspensionReason: string | null;
  isDemo: boolean;
  createdAt: number;
}

type Dialogs = { kind: 'suspend' | 'delete' | 'reset'; user: AdminUser; link?: string } | null;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function SuspendDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.suspendTitle', { name: user.displayName })}
      confirmLabel={t('admin.users.suspend')}
      danger
      confirmDisabled={reason.trim().length < 3}
      onConfirm={async () => {
        await api.post(`/api/admin/users/${user.id}/suspend`, { reason, days: days.trim() ? Number(days) : null });
        toast.success(t('admin.users.suspended'));
        onDone();
      }}
    >
      <Field label={t('admin.users.reason')}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            autoFocus
          />
        )}
      </Field>
      <Field label={t('admin.users.days')}>
        {(p) => (
          <Input {...p} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
        )}
      </Field>
    </ConfirmDialog>
  );
}

function DeleteDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [deleteMessages, setDeleteMessages] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.deleteTitle', { name: user.displayName })}
      body={t('admin.users.deleteBody')}
      confirmLabel={t('admin.users.delete')}
      danger
      onConfirm={async () => {
        try {
          await api.del(`/api/admin/users/${user.id}`, { deleteMessages });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'owns_communities') {
            const names = ((err.details as { communities?: { name: string }[] } | undefined)?.communities ?? [])
              .map((c) => c.name)
              .join(', ');
            throw new Error(`${err.message} (${names})`, { cause: err });
          }
          throw err;
        }
        toast.success(t('admin.users.deleted'));
        onDone();
      }}
    >
      <label className="flex items-center gap-2 text-sm text-fg-2">
        <input
          type="checkbox"
          checked={deleteMessages}
          onChange={(e) => setDeleteMessages(e.target.checked)}
          className="size-4 accent-[var(--danger)]"
        />
        {t('admin.users.deleteMessages')}
      </label>
    </ConfirmDialog>
  );
}

function UserRow({
  u,
  isAdmin,
  selfId,
  open,
  onChanged,
}: {
  u: AdminUser;
  isAdmin: boolean;
  selfId: string;
  open: (d: Dialogs) => void;
  onChanged: () => void;
}) {
  const self = u.id === selfId;
  const canAct = !self && u.status !== 'deleted' && (isAdmin || u.platformRole === 'member');
  const setRole = async (role: PlatformRole) => {
    try {
      await api.put(`/api/admin/users/${u.id}/role`, { role });
      toast.success(t('admin.users.roleChanged'));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const restore = async () => {
    try {
      await api.post(`/api/admin/users/${u.id}/restore`);
      toast.success(t('admin.users.restored'));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const resetLink = async () => {
    try {
      const { link } = await api.post<{ link: string }>(`/api/admin/users/${u.id}/reset-link`);
      open({ kind: 'reset', user: u, link });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <li className="flex items-center gap-3 px-4 py-3" data-testid="admin-user-row">
      <UserAvatar name={u.displayName} src={u.avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          {u.status === 'deleted' ? (
            <span className="font-medium text-fg-muted">{u.displayName}</span>
          ) : (
            <Link to={`/u/${u.username}`} className="font-medium text-fg hover:underline">
              {u.displayName}
            </Link>
          )}
          {u.isDemo && <DemoBadge />}
          {u.platformRole !== 'member' && <Badge tone="info">{t(`admin.users.roles.${u.platformRole}`)}</Badge>}
          {u.status !== 'active' && (
            <Badge tone={u.status === 'suspended' ? 'warning' : 'neutral'}>
              {t(`admin.users.statuses.${u.status}`)}
            </Badge>
          )}
          {self && <span className="text-xs text-fg-muted">({t('common.labels.you')})</span>}
        </p>
        <p className="truncate text-xs text-fg-muted">
          @{u.username} · {u.email}
          {!u.emailVerified && u.status !== 'deleted' && (
            <span className="text-warning"> · {t('admin.users.unverified')}</span>
          )}
        </p>
        {u.status === 'suspended' && (
          <p className="truncate text-xs text-fg-muted">
            {u.suspendedUntil ? t('admin.users.until', { date: formatDate(u.suspendedUntil) }) : ''}{' '}
            {u.suspensionReason ? `“${u.suspensionReason}”` : ''}
          </p>
        )}
      </div>
      <span className="hidden text-xs whitespace-nowrap text-fg-muted sm:block">{formatDate(u.createdAt)}</span>
      {canAct ? (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('common.actions.more')}>
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="w-64">
            {u.status === 'suspended' ? (
              <MenuItem onSelect={() => void restore()}>
                <RotateCcw /> {t('admin.users.restore')}
              </MenuItem>
            ) : (
              <MenuItem onSelect={() => open({ kind: 'suspend', user: u })}>
                <Ban /> {t('admin.users.suspend')}
              </MenuItem>
            )}
            {isAdmin && (
              <>
                <MenuItem onSelect={() => void resetLink()}>
                  <KeyRound /> {t('admin.users.resetLink')}
                </MenuItem>
                {u.status === 'active' && (
                  <>
                    <MenuSeparator />
                    <MenuLabel>
                      <UserCog className="mr-1.5 inline size-3.5" />
                      {t('admin.users.role')}
                    </MenuLabel>
                    <MenuRadioGroup value={u.platformRole} onValueChange={(v) => void setRole(v as PlatformRole)}>
                      {PLATFORM_ROLES.map((r) => (
                        <MenuRadioItem key={r} value={r}>
                          {t(`admin.users.roles.${r}`)}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </>
                )}
                <MenuSeparator />
                <MenuItem danger onSelect={() => open({ kind: 'delete', user: u })}>
                  <Trash2 /> {t('admin.users.delete')}
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      ) : (
        <span className="size-8" />
      )}
    </li>
  );
}

export function UsersSection({ isAdmin, selfId }: { isAdmin: boolean; selfId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const term = useDebounced(q.trim(), 250);
  const list = useInfiniteQuery({
    queryKey: ['admin', 'users', term, status, role],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams(
        Object.entries({ q: term, status, role, before: pageParam ? String(pageParam) : '' }).filter(([, v]) => v),
      );
      return api.get<{ users: AdminUser[] }>(`/api/admin/users?${qs}`).then((r) => r.users);
    },
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]?.createdAt : undefined),
  });
  const users = list.data?.pages.flat() ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.users.search')}
            aria-label={t('admin.users.search')}
            className="pl-9"
            type="search"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t('admin.users.status')}
          className="w-40"
        >
          <option value="">{t('admin.users.allStatuses')}</option>
          {(['active', 'suspended', 'deleted'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`admin.users.statuses.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label={t('admin.users.role')}
          className="w-40"
        >
          <option value="">{t('admin.users.allRoles')}</option>
          {PLATFORM_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`admin.users.roles.${r}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="rounded-xl border border-line-subtle bg-sidebar/60">
        {list.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={Search} title={t('admin.users.empty')} />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {users.map((u) => (
              <UserRow key={u.id} u={u} isAdmin={isAdmin} selfId={selfId} open={setDialog} onChanged={refresh} />
            ))}
          </ul>
        )}
      </div>
      {list.hasNextPage && (
        <Button className="self-center" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {t('common.actions.loadMore')}
        </Button>
      )}
      {dialog?.kind === 'suspend' && (
        <SuspendDialog user={dialog.user} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog user={dialog.user} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'reset' && dialog.link && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)}>
          <DialogContent title={t('admin.users.resetLink')} description={t('admin.users.resetLinkHint')} size="md">
            <div className="flex gap-2">
              <Input
                readOnly
                value={dialog.link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t('admin.users.resetLink')}
                className="font-mono text-xs"
              />
              <Button variant="primary" onClick={() => void copyText(dialog.link ?? '')}>
                {t('common.actions.copy')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
