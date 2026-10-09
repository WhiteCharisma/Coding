import { Permission, type ChannelDTO, type CommunityDTO } from '@creator-network/shared';
import { Bell, BellOff, ChevronDown, FolderPlus, Hash, Link2, LogOut, Megaphone, Plus, Settings, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { CountBadge, DemoBadge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { toast } from '../../components/ui/toast';
import { Lock } from 'lucide-react';
import type { SelfUser } from '@creator-network/shared';
import { copyText } from '../chat/actions';
import { ChannelEditorDialog } from './ChannelEditorDialog';
import { CommunitySettingsDialog } from './CommunitySettingsDialog';
import { hasCommunityPerm } from './hooks';
import { InviteDialog } from './InviteDialog';
import { CategoryDialog } from './CategoryDialog';

function readOnly(ch: ChannelDTO): boolean {
  return (ch.myPermissions & Permission.SEND_MESSAGES) === 0 && (ch.myPermissions & Permission.ADMINISTRATOR) === 0;
}

function ChannelLink({ community, channel, active, muted }: { community: CommunityDTO; channel: ChannelDTO; active: boolean; muted: boolean }) {
  const unread = useChat((s) => s.unreads[channel.id]);
  const hasUnread = !!unread && unread.unread > 0 && !muted;
  const mentions = unread?.mentions ?? 0;
  const Icon = channel.isPrivate ? Lock : readOnly(channel) ? Megaphone : Hash;
  return (
    <Link
      to={`/c/${community.id}/${channel.id}`}
      aria-current={active ? 'page' : undefined}
      title={channel.topic || undefined}
      className={cn(
        'group relative mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-ui transition-colors duration-[var(--dur-fast)]',
        active ? 'bg-selected text-fg' : hasUnread ? 'text-fg hover:bg-hover' : 'text-fg-muted hover:bg-hover hover:text-fg-2',
      )}
    >
      {hasUnread && !active && <span aria-hidden className="absolute top-1/2 -left-2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-fg" />}
      <Icon className={cn('size-4', active ? 'text-accent-text' : 'text-fg-faint')} aria-label={channel.isPrivate ? t('community.sidebar.privateChannel') : readOnly(channel) ? t('community.sidebar.readOnly') : undefined} />
      <span className={cn('min-w-0 flex-1 truncate', hasUnread && 'font-semibold')}>{channel.name}</span>
      {mentions > 0 && <CountBadge count={mentions} tone="danger" label={t('community.sidebar.unreadMentions', { count: mentions })} />}
    </Link>
  );
}

export function CommunitySidebar({ community }: { community: CommunityDTO }) {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`cn.collapsed.${community.id}`) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const muted = !!user?.mutedCommunityIds.includes(community.id);
  const isOwner = user?.id === community.ownerId;
  const canManageChannels = hasCommunityPerm(community, Permission.MANAGE_CHANNELS);
  const canInvite = hasCommunityPerm(community, Permission.CREATE_INVITES);
  const canSettings =
    canManageChannels ||
    hasCommunityPerm(community, Permission.MANAGE_COMMUNITY) ||
    hasCommunityPerm(community, Permission.MANAGE_ROLES) ||
    hasCommunityPerm(community, Permission.KICK_MEMBERS) ||
    hasCommunityPerm(community, Permission.BAN_MEMBERS) ||
    hasCommunityPerm(community, Permission.VIEW_AUDIT_LOG) ||
    hasCommunityPerm(community, Permission.MANAGE_INVITES) ||
    isOwner;

  const toggleCategory = (id: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(`cn.collapsed.${community.id}`, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleMute = async () => {
    if (!user) return;
    const ids = muted ? user.mutedCommunityIds.filter((x) => x !== community.id) : [...user.mutedCommunityIds, community.id];
    try {
      const res = await api.patch<{ user: SelfUser }>('/api/me/preferences', { mutedCommunityIds: ids });
      useSession.getState().setUser(res.user);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const uncategorized = community.channels.filter((c) => !c.categoryId || !community.categories.some((cat) => cat.id === c.categoryId));
  const groups = community.categories.map((cat) => ({ cat, channels: community.channels.filter((c) => c.categoryId === cat.id) })).filter((g) => g.channels.length > 0 || canManageChannels);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-line-subtle px-4 text-left transition-colors hover:bg-hover"
            data-testid="community-menu"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{community.name}</span>
                {community.isDemo && <DemoBadge />}
              </span>
            </span>
            <ChevronDown className="size-4 text-fg-muted" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-60">
          {canInvite && (
            <MenuItem onSelect={() => setInviteOpen(true)} className="text-accent-text data-[highlighted]:text-accent-text [&_svg]:text-accent-text">
              <UserPlus /> {t('community.sidebar.invite')}
            </MenuItem>
          )}
          {canSettings && (
            <MenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings /> {t('community.sidebar.settings')}
            </MenuItem>
          )}
          {canManageChannels && (
            <>
              <MenuItem onSelect={() => setChannelOpen(true)}>
                <Plus /> {t('community.sidebar.createChannel')}
              </MenuItem>
              <MenuItem onSelect={() => setCategoryOpen(true)}>
                <FolderPlus /> {t('community.sidebar.createCategory')}
              </MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem onSelect={() => void toggleMute()}>
            {muted ? <Bell /> : <BellOff />} {muted ? t('community.sidebar.unmute') : t('community.sidebar.notifications')}
          </MenuItem>
          <MenuItem onSelect={() => void copyText(`${window.location.origin}/c/${community.id}`)}>
            <Link2 /> {t('community.sidebar.copyId')}
          </MenuItem>
          {!isOwner && (
            <>
              <MenuSeparator />
              <MenuItem danger onSelect={() => setLeaveOpen(true)}>
                <LogOut /> {t('community.sidebar.leave')}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      <nav aria-label={community.name} className="scroll-area min-h-0 flex-1 py-3">
        {community.channels.length === 0 && <p className="px-4 text-sm text-fg-muted">{t('community.sidebar.noChannels')}</p>}
        {uncategorized.length > 0 && (
          <ul className="mb-3 flex flex-col gap-px">
            {uncategorized.map((ch) => (
              <li key={ch.id}>
                <ChannelLink community={community} channel={ch} active={ch.id === channelId} muted={muted} />
              </li>
            ))}
          </ul>
        )}
        {groups.map(({ cat, channels }) => {
          const isCollapsed = collapsed.has(cat.id);
          return (
            <section key={cat.id} className="mb-3">
              <h2 className="group/cat mb-0.5 flex items-center px-2">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCategory(cat.id)}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase hover:text-fg-2"
                >
                  <ChevronDown className={cn('size-3 transition-transform duration-[var(--dur-fast)]', isCollapsed && '-rotate-90')} />
                  <span className="truncate">{cat.name}</span>
                </button>
                {canManageChannels && (
                  <button type="button" aria-label={t('community.sidebar.createChannel')} onClick={() => setChannelOpen(true)} className="rounded p-1 text-fg-muted opacity-0 transition-opacity group-hover/cat:opacity-100 hover:text-fg focus-visible:opacity-100">
                    <Plus className="size-3.5" />
                  </button>
                )}
              </h2>
              {!isCollapsed && (
                <ul className="flex flex-col gap-px">
                  {channels.map((ch) => (
                    <li key={ch.id}>
                      <ChannelLink community={community} channel={ch} active={ch.id === channelId} muted={muted} />
                    </li>
                  ))}
                </ul>
              )}
              {isCollapsed &&
                channels
                  .filter((ch) => ch.id === channelId)
                  .map((ch) => (
                    <ChannelLink key={ch.id} community={community} channel={ch} active muted={muted} />
                  ))}
            </section>
          );
        })}
      </nav>

      {inviteOpen && <InviteDialog community={community} open={inviteOpen} onOpenChange={setInviteOpen} />}
      {settingsOpen && <CommunitySettingsDialog community={community} open={settingsOpen} onOpenChange={setSettingsOpen} />}
      {channelOpen && <ChannelEditorDialog community={community} open={channelOpen} onOpenChange={setChannelOpen} />}
      {categoryOpen && <CategoryDialog community={community} open={categoryOpen} onOpenChange={setCategoryOpen} />}
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t('community.join.leaveTitle', { name: community.name })}
        body={t('community.join.leaveBody')}
        confirmLabel={t('common.actions.leave')}
        danger
        onConfirm={async () => {
          await api.post(`/api/communities/${community.id}/leave`);
          useChat.getState().removeCommunity(community.id);
          toast.info(t('community.join.left', { name: community.name }));
          void navigate('/home');
        }}
      />
    </div>
  );
}
