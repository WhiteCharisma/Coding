import type { CommunityDTO, MemberDTO, MessageDTO, RoleDTO, UserSummary } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { Crown, Paperclip, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { stripFormatting } from '../../lib/markdown';
import { useChat } from '../../stores/chat';
import { useMessages } from '../../stores/messages';
import { DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Sheet } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { UserAvatar } from '../../components/user/UserAvatar';
import { ProfilePopover } from '../profile/ProfilePopover';
import { useIsWide } from '../shell/hooks';

function MemberRow({ user, color, isOwner }: { user: UserSummary; color: string | null; isOwner: boolean }) {
  const status = useChat((s) => s.presence[user.id] ?? 'offline');
  return (
    <li>
      <ProfilePopover username={user.username} side="left" disabled={user.deleted}>
        <button type="button" className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover', status === 'offline' && 'opacity-55 hover:opacity-100')}>
          <UserAvatar name={user.displayName} src={user.avatarUrl} size="md" presence={status} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-ui font-medium text-fg-2" style={color ? { color } : undefined}>
                {user.displayName}
              </span>
              {isOwner && <Crown className="size-3.5 shrink-0 text-warning" aria-label={t('common.labels.owner')} />}
              {user.isDemo && <DemoBadge />}
            </span>
            {user.headline && <span className="block truncate text-xs text-fg-muted">{user.headline}</span>}
          </span>
        </button>
      </ProfilePopover>
    </li>
  );
}

export function MembersPanel({ community, members }: { community: CommunityDTO; members: MemberDTO[] | undefined }) {
  const presence = useChat((s) => s.presence);
  if (!members) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    );
  }
  const roles = new Map<string, RoleDTO>(community.roles.map((r) => [r.id, r]));
  const hoisted = community.roles.filter((r) => r.hoist && !r.isDefault).sort((a, b) => b.position - a.position);
  const colorOf = (m: MemberDTO) => {
    let best: RoleDTO | null = null;
    for (const id of m.roleIds) {
      const r = roles.get(id);
      if (r?.color && (!best || r.position > best.position)) best = r;
    }
    return best?.color ?? null;
  };
  const online = members.filter((m) => (presence[m.user.id] ?? m.presence) !== 'offline');
  const offline = members.filter((m) => (presence[m.user.id] ?? m.presence) === 'offline');
  const placed = new Set<string>();
  const sections: { title: string; list: MemberDTO[] }[] = [];
  for (const role of hoisted) {
    const list = online.filter((m) => !placed.has(m.user.id) && m.roleIds.includes(role.id));
    list.forEach((m) => placed.add(m.user.id));
    if (list.length) sections.push({ title: `${role.name} — ${list.length}`, list });
  }
  const rest = online.filter((m) => !placed.has(m.user.id));
  if (rest.length) sections.push({ title: t('community.members.online', { count: rest.length }), list: rest });
  if (offline.length) sections.push({ title: t('community.members.offline', { count: offline.length }), list: offline });

  return (
    <div className="flex flex-col gap-4 p-3">
      {sections.map((s) => (
        <section key={s.title}>
          <h3 className="mb-1 px-2 text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{s.title}</h3>
          <ul className="flex flex-col">
            {s.list.map((m) => (
              <MemberRow key={m.user.id} user={m.user} color={colorOf(m)} isOwner={m.user.id === community.ownerId} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PinsPanel({ channelId }: { channelId: string }) {
  const pins = useQuery({ queryKey: ['pins', channelId], queryFn: () => api.get<{ messages: MessageDTO[] }>(`/api/channels/${channelId}/pins`).then((r) => r.messages) });
  if (pins.isLoading) return <div className="p-4"><Skeleton className="h-20 w-full" /></div>;
  if (!pins.data?.length) return <p className="p-5 text-sm text-fg-muted">{t('chat.pins.empty')}</p>;
  return (
    <ul className="flex flex-col gap-2 p-3">
      {pins.data.map((m) => (
        <li key={m.id} className="rounded-lg border border-line-subtle bg-elevated/60 p-3">
          <div className="flex items-center gap-2">
            <UserAvatar name={m.author?.displayName ?? '?'} src={m.author?.avatarUrl} size="sm" />
            <span className="truncate text-sm font-semibold text-fg">{m.author?.displayName ?? t('common.labels.deletedUser')}</span>
            <span className="ml-auto shrink-0 font-mono text-[10.5px] text-fg-muted">{formatDateTime(m.createdAt)}</span>
          </div>
          {m.content && <p className="mt-1.5 line-clamp-4 text-sm text-fg-2">{stripFormatting(m.content)}</p>}
          {m.attachments.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
              <Paperclip className="size-3" /> {m.attachments.map((a) => a.name).join(', ')}
            </p>
          )}
          <Button variant="link" size="sm" className="mt-1 h-auto" onClick={() => void useMessages.getState().jumpTo(channelId, m.id)}>
            {t('chat.pins.jump')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Right-hand panel: inline on wide screens, a drawer elsewhere. */
export function ContextPanel({ panel, title, onClose, children }: { panel: 'members' | 'pins' | null; title: string; onClose: () => void; children: ReactNode }) {
  const wide = useIsWide();
  if (wide) {
    if (!panel) return null;
    return (
      <aside aria-label={title} className="flex w-[var(--context-width)] shrink-0 flex-col border-l border-line-subtle bg-sidebar animate-fade-in">
        <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-line-subtle px-4">
          <h2 className="font-display text-sm font-semibold text-fg">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label={t('shell.closePanel')} onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="scroll-area min-h-0 flex-1">{children}</div>
      </aside>
    );
  }
  return (
    <Sheet open={panel !== null} onOpenChange={(o) => !o && onClose()} side="right" title={title}>
      <div className="flex h-[var(--header-height)] shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <h2 className="font-display text-sm font-semibold text-fg">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t('shell.closePanel')} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="scroll-area min-h-0 flex-1">{children}</div>
    </Sheet>
  );
}
