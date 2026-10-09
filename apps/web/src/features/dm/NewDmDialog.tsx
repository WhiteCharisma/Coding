import { LIMITS, type DmChannelDTO, type UserSummary } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Field, Input } from '../../components/ui/input';
import { DemoBadge } from '../../components/ui/badge';
import { UserAvatar } from '../../components/user/UserAvatar';

export async function openDmWith(userIds: string[], name?: string): Promise<DmChannelDTO> {
  const { dm } = await api.post<{ dm: DmChannelDTO }>('/api/dms', { userIds, ...(name ? { name } : {}) });
  useChat.getState().upsertDm(dm);
  return dm;
}

export function NewDmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const results = useQuery({
    queryKey: ['user-search', q],
    queryFn: () => api.get<{ users: UserSummary[] }>(`/api/users/search?q=${encodeURIComponent(q)}`).then((r) => r.users),
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  });

  const toggle = (u: UserSummary) => setPicked((cur) => (cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : cur.length < LIMITS.groupDmMax - 1 ? [...cur, u] : cur));

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const dm = await openDmWith(picked.map((p) => p.id), picked.length > 1 && name.trim() ? name.trim() : undefined);
      onOpenChange(false);
      setPicked([]);
      setQ('');
      void navigate(`/dm/${dm.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('dm.newTitle')}
        description={t('dm.newHint', { max: LIMITS.groupDmMax })}
        footer={
          <Button variant="primary" loading={busy} disabled={picked.length === 0} onClick={() => void start()}>
            {t('dm.start')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {picked.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {picked.map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => toggle(u)} className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft py-0.5 pr-2 pl-0.5 text-sm text-accent-text">
                    <UserAvatar name={u.displayName} src={u.avatarUrl} size="xs" /> {u.displayName} <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dm.searchPeople')} aria-label={t('dm.searchPeople')} className="pl-9" data-testid="dm-search" />
          </div>
          <ul className="flex min-h-40 flex-col gap-0.5">
            {results.data?.map((u) => {
              const on = picked.some((x) => x.id === u.id);
              return (
                <li key={u.id}>
                  <button type="button" onClick={() => toggle(u)} aria-pressed={on} className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', on ? 'bg-selected' : 'hover:bg-hover')}>
                    <UserAvatar name={u.displayName} src={u.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-ui font-medium text-fg">
                        {u.displayName} {u.isDemo && <DemoBadge />}
                      </span>
                      <span className="block truncate text-xs text-fg-muted">@{u.username}{u.headline ? ` · ${u.headline}` : ''}</span>
                    </span>
                    <span className={cn('grid size-5 place-items-center rounded-full border text-[11px]', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>{on ? '✓' : ''}</span>
                  </button>
                </li>
              );
            })}
            {q && results.data?.length === 0 && <li className="p-3 text-sm text-fg-muted">{t('search.peopleEmpty')}</li>}
          </ul>
          {picked.length > 1 && <Field label={t('dm.groupName')} optional={t('common.labels.optional')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('dm.groupNamePlaceholder')} maxLength={40} />}</Field>}
          {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
