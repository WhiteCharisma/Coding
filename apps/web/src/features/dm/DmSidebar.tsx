import type { DmChannelDTO } from '@creator-network/shared';
import { Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { stripFormatting } from '../../lib/markdown';
import { dmDisplayName, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { CountBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Orb } from '../../components/ui/orb';
import { Tooltip } from '../../components/ui/tooltip';
import { UserAvatar } from '../../components/user/UserAvatar';
import { NewDmDialog } from './NewDmDialog';

function DmRow({ dm, active, selfId }: { dm: DmChannelDTO; active: boolean; selfId: string }) {
  const unread = useChat((s) => s.unreads[dm.id]);
  const others = dm.participants.filter((p) => p.id !== selfId);
  const first = others[0];
  const presence = useChat((s) => (first && dm.kind === 'dm' ? (s.presence[first.id] ?? 'offline') : undefined));
  const name = dmDisplayName(dm, selfId);
  const hasUnread = (unread?.unread ?? 0) > 0;
  return (
    <Link
      to={`/dm/${dm.id}`}
      aria-current={active ? 'page' : undefined}
      className="aero-item mx-2 flex items-center gap-3 rounded-xl px-2 py-2"
    >
      {dm.kind === 'group_dm' ? (
        <Orb icon={Users} size="md" tone="neutral" />
      ) : (
        <UserAvatar name={first?.displayName ?? name} src={first?.avatarUrl} size="lg" presence={presence} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-ui',
              hasUnread ? 'font-semibold text-fg' : 'font-medium text-fg-2',
            )}
          >
            {name}
          </span>
          {dm.lastMessageAt && (
            <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{formatRelative(dm.lastMessageAt)}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs', hasUnread ? 'text-fg-2' : 'text-fg-muted')}>
            {dm.kind === 'group_dm' && !dm.lastMessagePreview
              ? t('dm.groupMembers', { count: dm.participants.length })
              : stripFormatting(dm.lastMessagePreview ?? '')}
          </span>
          {hasUnread && <CountBadge count={unread?.unread ?? 0} tone="danger" />}
        </span>
      </span>
    </Link>
  );
}

export function DmSidebar() {
  const { channelId } = useParams();
  const user = useSession((s) => s.user);
  const dms = useChat((s) => s.dms);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const all = Object.values(dms).sort(
    (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0) || b.id.localeCompare(a.id),
  );
  const needle = query.trim().toLowerCase();
  const list = needle
    ? all.filter(
        (dm) =>
          dmDisplayName(dm, user?.id ?? '')
            .toLowerCase()
            .includes(needle) || dm.participants.some((p) => p.username.toLowerCase().includes(needle)),
      )
    : all;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="pane-head justify-between px-4">
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-fg">{t('dm.title')}</h2>
        <Tooltip content={t('dm.new')}>
          <Button
            variant="secondary"
            size="icon-sm"
            className="rounded-full"
            aria-label={t('dm.new')}
            onClick={() => setOpen(true)}
            data-testid="new-dm"
          >
            <Plus />
          </Button>
        </Tooltip>
      </div>
      {all.length > 3 && (
        <div className="relative px-3 pt-3">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-5.5 mt-1.5 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('dm.filter')}
            aria-label={t('dm.filter')}
            className="h-9 rounded-full pl-9"
          />
        </div>
      )}
      <nav aria-label={t('dm.title')} className="scroll-area min-h-0 flex-1 py-2">
        {needle && list.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-fg-muted">{t('dm.noMatch', { query: query.trim() })}</p>
        ) : list.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-fg-muted">{t('dm.empty')}</p>
            <p className="mt-1 text-xs text-fg-muted">{t('dm.emptyHint')}</p>
            <Button className="mt-4" size="sm" variant="primary" onClick={() => setOpen(true)}>
              <Plus /> {t('dm.new')}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {list.map((dm) => (
              <li key={dm.id}>
                <DmRow dm={dm} active={dm.id === channelId} selfId={user?.id ?? ''} />
              </li>
            ))}
          </ul>
        )}
      </nav>
      <NewDmDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
