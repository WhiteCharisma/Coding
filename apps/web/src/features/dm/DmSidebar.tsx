import type { DmChannelDTO } from '@creator-network/shared';
import { Plus, Users } from 'lucide-react';
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
      className={cn('mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-[var(--dur-fast)]', active ? 'bg-selected' : 'hover:bg-hover')}
    >
      {dm.kind === 'group_dm' ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-elevated text-fg-2">
          <Users className="size-5" />
        </span>
      ) : (
        <UserAvatar name={first?.displayName ?? name} src={first?.avatarUrl} size="lg" presence={presence} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-ui', hasUnread ? 'font-semibold text-fg' : 'font-medium text-fg-2')}>{name}</span>
          {dm.lastMessageAt && <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{formatRelative(dm.lastMessageAt)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs', hasUnread ? 'text-fg-2' : 'text-fg-muted')}>
            {dm.kind === 'group_dm' && !dm.lastMessagePreview ? t('dm.groupMembers', { count: dm.participants.length }) : stripFormatting(dm.lastMessagePreview ?? '')}
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
  const list = Object.values(dms).sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0) || b.id.localeCompare(a.id));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-fg">{t('dm.title')}</h2>
        <Tooltip content={t('dm.new')}>
          <Button variant="ghost" size="icon-sm" aria-label={t('dm.new')} onClick={() => setOpen(true)} data-testid="new-dm">
            <Plus />
          </Button>
        </Tooltip>
      </div>
      <nav aria-label={t('dm.title')} className="scroll-area min-h-0 flex-1 py-2">
        {list.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-fg-muted">{t('dm.empty')}</p>
            <p className="mt-1 text-xs text-fg-faint">{t('dm.emptyHint')}</p>
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
