import type { CommunityDTO } from '@creator-network/shared';
import {
  Bell,
  CloudOff,
  Compass,
  House,
  LayoutGrid,
  MessageCircle,
  Mic,
  MicOff,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  LogOut,
  AudioLines,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { memo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatLongDate, formatNumericDate, formatTime, hueFor } from '../../lib/format';
import { playSound, setSoundPref, useSoundPrefs, type SoundChannel } from '../../lib/sounds';
import { communityUnread, useChat } from '../../stores/chat';
import { useDesktop } from '../../stores/desktop';
import { useSession } from '../../stores/session';
import { useVoice } from '../../stores/voice';
import { LogoMark } from '../../components/brand/Logo';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { CountBadge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { Tooltip } from '../../components/ui/tooltip';
import { UserAvatar } from '../../components/user/UserAvatar';
import { CreateJoinDialog } from '../community/CreateJoinDialog';
import { useVoicePlace } from '../voice/VoiceParts';
import { AnalogClock, useNow } from './Clock';
import { UserMenu } from './UserMenu';
import { useSignOut } from './useSignOut';

/** The coloured glow under the pointer follows it across the button (Windows 7 "hot-track"). */
function trackPointer(e: PointerEvent<HTMLElement>) {
  const box = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - box.left}px`);
}

interface TaskbarItemProps {
  label: string;
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  unread?: boolean;
  badge?: number;
  /** Hue of the glow (communities glow in their own colour). */
  hue?: number;
  /** Shown instead of the plain label when the pointer rests on the button. */
  preview?: ReactNode;
  testId?: string;
}

function TaskbarItem({
  label,
  children,
  to,
  onClick,
  active = false,
  unread = false,
  badge = 0,
  hue,
  preview,
  testId,
}: TaskbarItemProps) {
  const style = hue === undefined ? undefined : ({ '--hot': `oklch(0.78 0.15 ${hue} / 0.95)` } as CSSProperties);
  const inner = (
    <>
      {/* Someone mentioned you here: the button asks for attention, as a Vista window does. */}
      {badge > 0 && !active && <span aria-hidden className="taskbar-attention" />}
      {children}
      {unread && !active && <span aria-hidden className="taskbar-unread" />}
      {badge > 0 && (
        <CountBadge
          count={badge}
          tone="danger"
          className="absolute -top-1 -right-0.5 ring-2 ring-[var(--taskbar-lo)]"
        />
      )}
    </>
  );
  return (
    <Tooltip content={preview ?? label} variant={preview ? 'thumbnail' : 'label'}>
      {to ? (
        <Link
          to={to}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className="taskbar-btn"
          style={style}
          data-testid={testId}
          onPointerMove={trackPointer}
          onClick={() => {
            if (!active) playSound('click');
            useDesktop.getState().setMinimized(false);
          }}
        >
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={label}
          className="taskbar-btn"
          style={style}
          data-testid={testId}
          onPointerMove={trackPointer}
          onClick={onClick}
        >
          {inner}
        </button>
      )}
    </Tooltip>
  );
}

/** A community on the taskbar. Memoised: the taskbar re-renders whenever any unread count moves. */
const CommunityButton = memo(function CommunityButton({
  community,
  active,
  unread,
  mentions,
}: {
  community: CommunityDTO;
  active: boolean;
  unread: boolean;
  mentions: number;
}) {
  return (
    <TaskbarItem
      to={`/c/${community.id}`}
      label={community.name}
      active={active}
      unread={unread}
      badge={mentions}
      hue={hueFor(community.name)}
      preview={<CommunityThumbnail community={community} mentions={mentions} unread={unread} />}
    >
      <CommunityIcon name={community.name} src={community.iconUrl} size="sm" className="size-7" />
    </TaskbarItem>
  );
});

/** The preview over a community's taskbar button: its picture and what is new there. */
function CommunityThumbnail({
  community,
  mentions,
  unread,
}: {
  community: CommunityDTO;
  mentions: number;
  unread: boolean;
}) {
  const summary =
    mentions > 0
      ? t('shell.thumbnail.mentions', { count: mentions })
      : unread
        ? t('shell.thumbnail.unread')
        : t('shell.thumbnail.quiet');
  return (
    <div className="flex w-48 flex-col gap-1.5">
      <p className="truncate px-0.5 text-xs font-semibold text-taskbar">{community.name}</p>
      <div className="taskbar-thumb-view flex flex-col items-center gap-2 px-2 py-3">
        <CommunityIcon name={community.name} src={community.iconUrl} size="lg" />
        <p className="text-center text-xs text-fg-muted">{summary}</p>
      </div>
    </div>
  );
}

function StartLink({
  to,
  icon,
  children,
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link to={to} className="start-link" onClick={onNavigate}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

/** The Start menu: places and communities on the left, you and your settings on the right. */
function StartMenu({ close, onCreate, onSignOut }: { close: () => void; onCreate: () => void; onSignOut: () => void }) {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const [query, setQuery] = useState('');
  if (!user) return null;
  const search = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    void navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    close();
  };
  const go = () => {
    playSound('click');
    close();
  };
  const ic = 'size-5 text-accent-text';
  return (
    <div className="start-menu taskbar-glass" data-testid="start-menu">
      <div className="start-menu-left">
        <div className="flex flex-col gap-px p-1.5">
          <StartLink to="/home" icon={<House className={ic} />} onNavigate={go}>
            {t('shell.nav.home')}
          </StartLink>
          <StartLink to="/explore" icon={<Compass className={ic} />} onNavigate={go}>
            {t('shell.nav.explore')}
          </StartLink>
          <StartLink to="/search" icon={<Search className={ic} />} onNavigate={go}>
            {t('shell.nav.search')}
          </StartLink>
        </div>
        <div className="mx-3 h-px bg-line" />
        <p className="px-3 pt-2 pb-1 text-xs font-semibold text-fg-muted">{t('shell.nav.yourCommunities')}</p>
        <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-1.5">
          {order.slice(0, 8).map((id) => {
            const c = communities[id];
            return c ? (
              <StartLink
                key={id}
                to={`/c/${c.id}`}
                icon={<CommunityIcon name={c.name} src={c.iconUrl} size="xs" />}
                onNavigate={go}
              >
                {c.name}
              </StartLink>
            ) : null;
          })}
          {order.length === 0 && <p className="px-2 py-1 text-sm text-fg-muted">{t('shell.start.noCommunities')}</p>}
        </div>
        <div className="border-t border-line-subtle p-1.5">
          <StartLink to="/communities" icon={<LayoutGrid className={ic} />} onNavigate={go}>
            {t('shell.start.allCommunities')}
          </StartLink>
          <form role="search" onSubmit={search} className="glass-field mt-1.5 px-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('shell.start.search')}
              placeholder={t('shell.start.search')}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted placeholder:italic focus:outline-none focus-visible:shadow-none"
            />
            <Search aria-hidden className="size-3.5 text-fg-muted" />
          </form>
        </div>
      </div>
      <div className="start-menu-right">
        <div className="start-picture">
          <UserAvatar name={user.displayName} src={user.avatarUrl} size="lg" />
        </div>
        <Link to={`/u/${user.username}`} className="start-link" onClick={go}>
          <span className="truncate">{user.displayName}</span>
        </Link>
        <div className="my-1 h-px bg-linear-to-r from-transparent via-[var(--taskbar-edge)] to-transparent" />
        <Link to="/dm" className="start-link" onClick={go}>
          <MessageCircle className="size-4" /> {t('shell.nav.messagesShort')}
        </Link>
        <Link to="/notifications" className="start-link" onClick={go}>
          <Bell className="size-4" /> {t('shell.nav.notifications')}
        </Link>
        <Link to="/settings" className="start-link" onClick={go}>
          <Settings className="size-4" /> {t('shell.nav.settings')}
        </Link>
        <Link to="/settings/appearance" className="start-link" onClick={go}>
          <Palette className="size-4" /> {t('shell.start.personalize')}
        </Link>
        <Link to="/settings/voice" className="start-link" onClick={go}>
          <AudioLines className="size-4" /> {t('settings.sections.voice')}
        </Link>
        {user.platformRole !== 'member' && (
          <Link to="/admin" className="start-link" onClick={go}>
            <ShieldCheck className="size-4" /> {t('shell.nav.admin')}
          </Link>
        )}
        <div className="my-1 h-px bg-linear-to-r from-transparent via-[var(--taskbar-edge)] to-transparent" />
        <button
          type="button"
          className="start-link text-left"
          onClick={() => {
            close();
            onCreate();
          }}
        >
          <Plus className="size-4" /> {t('shell.nav.addCommunity')}
        </button>
        <div className="mt-auto flex justify-end py-2 pr-1">
          <button
            type="button"
            className="start-power"
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            <LogOut className="size-4" /> {t('shell.userMenu.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}

function StartButton({ onCreate, onSignOut }: { onCreate: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) playSound('open');
      }}
    >
      <Tooltip content={t('shell.start.label')}>
        <PopoverTrigger asChild>
          <button type="button" className="start-orb" aria-label={t('shell.start.label')} data-testid="start-button">
            <LogoMark className="size-8" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        ref={content}
        // Only a transform here: an opacity animation on this wrapper would stop the glass
        // inside from blurring what is behind the menu (the glass fades itself, vista.css).
        className="w-auto rounded-lg border-0 bg-transparent p-0 shadow-none [-webkit-backdrop-filter:none] [backdrop-filter:none] data-[state=closed]:animate-[start-sink_140ms_var(--ease-in)_both] data-[state=open]:animate-[start-rise_220ms_var(--ease-out)_both]"
        aria-label={t('shell.start.label')}
        // As on Windows: the Start menu opens ready to search.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          content.current?.querySelector<HTMLInputElement>('input[type="search"], input')?.focus();
        }}
      >
        <StartMenu close={() => setOpen(false)} onCreate={onCreate} onSignOut={onSignOut} />
      </PopoverContent>
    </Popover>
  );
}

function SoundChannelRow({ channel, label }: { channel: SoundChannel; label: string }) {
  const pref = useSoundPrefs()[channel];
  return (
    <div className="flex flex-col gap-2">
      <Switch
        className="py-0"
        label={label}
        checked={pref.enabled}
        onCheckedChange={(enabled) => setSoundPref(channel, { enabled })}
      />
      <Slider
        label={t('settings.notifications.volumeOf', { name: label })}
        valueText={`${pref.volume} %`}
        value={pref.volume}
        disabled={!pref.enabled}
        onValueChange={(volume) => setSoundPref(channel, { volume })}
        onValueCommit={() => playSound(channel === 'ui' ? 'receive' : 'notification')}
      />
    </div>
  );
}

function SoundTray() {
  const prefs = useSoundPrefs();
  const silent = !prefs.ui.enabled && !prefs.notify.enabled;
  return (
    <Popover>
      <Tooltip content={t('shell.tray.sounds')}>
        <PopoverTrigger asChild>
          <button type="button" className="tray-btn" aria-label={t('shell.tray.sounds')}>
            {silent ? <VolumeX /> : <Volume2 />}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="end" className="flex w-64 flex-col gap-4 p-4">
        <p className="text-sm font-semibold text-fg">{t('settings.notifications.sounds')}</p>
        <SoundChannelRow channel="ui" label={t('settings.notifications.uiSounds')} />
        <SoundChannelRow channel="notify" label={t('settings.notifications.notifySounds')} />
        <Link to="/settings/notifications" className="text-sm font-semibold text-accent-text hover:underline">
          {t('shell.tray.soundSettings')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function VoiceTray() {
  const status = useVoice((s) => s.status);
  const channelId = useVoice((s) => s.channelId);
  const muted = useVoice((s) => s.muted);
  const speaking = useVoice((s) => s.speaking);
  const place = useVoicePlace(channelId);
  const navigate = useNavigate();
  if (status === 'idle' || !place) return null;
  const label = t('shell.tray.inVoice', { place: place.name });
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={cn('tray-btn', speaking && !muted && 'text-[var(--presence-online)]')}
        aria-label={label}
        onClick={() => void navigate(place.href)}
        data-testid="tray-voice"
      >
        {muted ? <MicOff /> : <Mic />}
      </button>
    </Tooltip>
  );
}

function ConnectionTray() {
  const connection = useChat((s) => s.connection);
  const label =
    connection === 'offline'
      ? t('shell.tray.offline')
      : connection === 'reconnecting' || connection === 'connecting'
        ? t('shell.tray.reconnecting')
        : t('shell.tray.online');
  const Icon = connection === 'offline' ? CloudOff : connection === 'connected' ? Wifi : RefreshCw;
  return (
    <Tooltip content={label}>
      <span role="img" aria-label={label} className="tray-btn">
        <Icon className={cn(Icon === RefreshCw && 'animate-spin')} />
      </span>
    </Tooltip>
  );
}

function ClockTray() {
  const now = useNow(60_000);
  return (
    <Popover>
      <Tooltip content={formatLongDate(now)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="tray-btn taskbar-clock"
            aria-label={t('shell.tray.clock', { time: formatTime(now) })}
          >
            <span className="block">{formatTime(now)}</span>
            <span className="block text-taskbar-muted">{formatNumericDate(now)}</span>
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="end" className="flex flex-col items-center gap-2 p-4">
        <AnalogClock className="size-36" />
        <p className="text-sm font-semibold text-fg">{formatLongDate(now)}</p>
      </PopoverContent>
    </Popover>
  );
}

/** The notification area. Memoised: none of it depends on what the taskbar re-renders for. */
const Tray = memo(function Tray() {
  const minimized = useDesktop((s) => s.minimized);
  return (
    <div className="tray">
      <VoiceTray />
      <ConnectionTray />
      <SoundTray />
      <UserMenu side="top" size="sm" className="tray-btn rounded-[3px] px-1" />
      <ClockTray />
      <Tooltip content={t('shell.tray.showDesktop')}>
        <button
          type="button"
          className="show-desktop"
          aria-label={t('shell.tray.showDesktop')}
          aria-pressed={minimized}
          onClick={() => useDesktop.getState().setMinimized(!minimized)}
        />
      </Tooltip>
    </div>
  );
});

/** The black-glass taskbar along the bottom of the desktop (tablets and computers). */
export function Taskbar() {
  const { pathname } = useLocation();
  const user = useSession((s) => s.user);
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const unreads = useChat((s) => s.unreads);
  const dms = useChat((s) => s.dms);
  const notifications = useChat((s) => s.unreadNotifications);
  const [createOpen, setCreateOpen] = useState(false);
  const { signOut, dialog } = useSignOut();
  const dmMentions = Object.keys(dms).reduce((sum, id) => sum + (unreads[id]?.mentions ?? 0), 0);
  const muted = new Set(user?.mutedCommunityIds ?? []);
  return (
    <nav aria-label={t('shell.nav.primary')} className="taskbar taskbar-glass max-md:hidden" data-testid="taskbar">
      <StartButton onCreate={() => setCreateOpen(true)} onSignOut={signOut} />
      <TaskbarItem to="/home" label={t('shell.nav.home')} active={pathname === '/home'}>
        <House />
      </TaskbarItem>
      <TaskbarItem
        to="/dm"
        label={t('shell.nav.messages')}
        active={pathname.startsWith('/dm')}
        badge={dmMentions}
        testId="rail-dms"
      >
        <MessageCircle />
      </TaskbarItem>
      <TaskbarItem
        to="/notifications"
        label={t('shell.nav.notifications')}
        active={pathname.startsWith('/notifications')}
        badge={notifications}
        testId="rail-notifications"
      >
        <Bell />
      </TaskbarItem>
      <TaskbarItem to="/search" label={t('shell.nav.search')} active={pathname.startsWith('/search')}>
        <Search />
      </TaskbarItem>
      <TaskbarItem to="/explore" label={t('shell.nav.explore')} active={pathname.startsWith('/explore')}>
        <Compass />
      </TaskbarItem>
      <span aria-hidden className="taskbar-sep" />
      <ul
        aria-label={t('shell.nav.yourCommunities')}
        className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto py-1"
      >
        {order.map((id) => {
          const c = communities[id];
          if (!c) return null;
          const state = communityUnread(c, unreads, muted.has(c.id));
          return (
            <li key={id}>
              <CommunityButton
                community={c}
                active={pathname.startsWith(`/c/${c.id}`)}
                unread={state.unread}
                mentions={state.mentions}
              />
            </li>
          );
        })}
        <li>
          <TaskbarItem
            onClick={() => setCreateOpen(true)}
            label={t('shell.nav.addCommunity')}
            testId="rail-add-community"
          >
            <Plus className="text-[var(--presence-online)]" />
          </TaskbarItem>
        </li>
      </ul>
      <Tray />
      <CreateJoinDialog open={createOpen} onOpenChange={setCreateOpen} />
      {dialog}
    </nav>
  );
}
