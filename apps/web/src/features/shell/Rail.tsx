import type { CommunityDTO } from '@creator-network/shared';
import {
  Bell,
  Compass,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { memo, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { hueFor } from '../../lib/format';
import { playSound, setSoundPref, useSoundPrefs, type SoundChannel } from '../../lib/sounds';
import { communityUnread, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { useVoice } from '../../stores/voice';
import { LogoMark } from '../../components/brand/Logo';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { CountBadge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { Tooltip } from '../../components/ui/tooltip';
import { CreateJoinDialog } from '../community/CreateJoinDialog';
import { useVoicePlace } from '../voice/VoiceParts';
import { UserMenu } from './UserMenu';

/** The coloured glow under the pointer follows it across the button (Windows 7 "hot-track"). */
function trackPointer(e: PointerEvent<HTMLElement>) {
  const box = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - box.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - box.top}px`);
}

interface RailButtonProps {
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

function RailButton({
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
}: RailButtonProps) {
  const style = hue === undefined ? undefined : ({ '--hot': `oklch(0.78 0.15 ${hue} / 0.95)` } as CSSProperties);
  const inner = (
    <>
      {/* Someone mentioned you here: the button asks for attention, as a Vista window does. */}
      {badge > 0 && !active && <span aria-hidden className="dock-attention" />}
      {children}
      {unread && !active && <span aria-hidden className="dock-unread" />}
      {badge > 0 && (
        <CountBadge count={badge} tone="danger" className="absolute -top-1 -right-1 ring-2 ring-[var(--dock-lo)]" />
      )}
    </>
  );
  return (
    <Tooltip content={preview ?? label} side="right" variant={preview ? 'thumbnail' : 'label'}>
      {to ? (
        <Link
          to={to}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className="dock-btn"
          style={style}
          data-testid={testId}
          onPointerMove={trackPointer}
          onClick={() => {
            if (!active) playSound('click');
          }}
        >
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={label}
          className="dock-btn"
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

/** The preview over a community's button: its picture and what is new there. */
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
      <p className="truncate px-0.5 text-xs font-semibold text-dock">{community.name}</p>
      <div className="dock-thumb-view flex flex-col items-center gap-2 px-2 py-3">
        <CommunityIcon name={community.name} src={community.iconUrl} size="lg" />
        <p className="text-center text-xs text-fg-muted">{summary}</p>
      </div>
    </div>
  );
}

/** A community on the rail. Memoised: the rail re-renders whenever any unread count moves. */
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
    <RailButton
      to={`/c/${community.id}`}
      label={community.name}
      active={active}
      unread={unread}
      badge={mentions}
      hue={hueFor(community.name)}
      preview={<CommunityThumbnail community={community} mentions={mentions} unread={unread} />}
    >
      <CommunityIcon name={community.name} src={community.iconUrl} size="sm" className="size-8" />
    </RailButton>
  );
});

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

/** Sound switches and volumes, one click away. */
function SoundButton() {
  const prefs = useSoundPrefs();
  const silent = !prefs.ui.enabled && !prefs.notify.enabled;
  return (
    <Popover>
      <Tooltip content={t('shell.rail.sounds')} side="right">
        <PopoverTrigger asChild>
          <button type="button" className="dock-btn dock-btn-sm" aria-label={t('shell.rail.sounds')}>
            {silent ? <VolumeX /> : <Volume2 />}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="right" align="end" className="flex w-64 flex-col gap-4 p-4">
        <p className="text-sm font-semibold text-fg">{t('settings.notifications.sounds')}</p>
        <SoundChannelRow channel="ui" label={t('settings.notifications.uiSounds')} />
        <SoundChannelRow channel="notify" label={t('settings.notifications.notifySounds')} />
        <Link to="/settings/notifications" className="text-sm font-semibold text-accent-text hover:underline">
          {t('shell.rail.soundSettings')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** While you are in a call: where, muted or not, and a way back there. */
function VoiceButton() {
  const status = useVoice((s) => s.status);
  const channelId = useVoice((s) => s.channelId);
  const muted = useVoice((s) => s.muted);
  const speaking = useVoice((s) => s.speaking);
  const place = useVoicePlace(channelId);
  const navigate = useNavigate();
  if (status === 'idle' || !place) return null;
  const label = t('shell.rail.inVoice', { place: place.name });
  return (
    <Tooltip content={label} side="right">
      <button
        type="button"
        className={cn('dock-btn dock-btn-sm', speaking && !muted && 'text-[var(--presence-online)]')}
        aria-label={label}
        onClick={() => void navigate(place.href)}
        data-testid="rail-voice"
      >
        {muted ? <MicOff /> : <Mic />}
      </button>
    </Tooltip>
  );
}

/** The foot of the rail. Memoised: none of it depends on unread counts. */
const RailFoot = memo(function RailFoot() {
  const { pathname } = useLocation();
  const staff = useSession((s) => s.user && s.user.platformRole !== 'member');
  return (
    <div className="rail-foot">
      <VoiceButton />
      <SoundButton />
      {staff && (
        <RailButton to="/admin" label={t('shell.nav.admin')} active={pathname.startsWith('/admin')}>
          <ShieldCheck />
        </RailButton>
      )}
      <RailButton to="/settings" label={t('shell.nav.settings')} active={pathname.startsWith('/settings')}>
        <Settings />
      </RailButton>
      <UserMenu side="right" size="sm" className="mt-1" />
    </div>
  );
});

/**
 * The app's navigation on tablets and computers: a column of smoky glass with the glossy orb on
 * top. Buttons glow in their community's colour under the pointer, flash orange when someone
 * mentions you and show what is new when the pointer rests on them.
 */
export function Rail() {
  const { pathname } = useLocation();
  const user = useSession((s) => s.user);
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const unreads = useChat((s) => s.unreads);
  const dms = useChat((s) => s.dms);
  const notifications = useChat((s) => s.unreadNotifications);
  const [createOpen, setCreateOpen] = useState(false);
  const dmMentions = Object.keys(dms).reduce((sum, id) => sum + (unreads[id]?.mentions ?? 0), 0);
  const muted = new Set(user?.mutedCommunityIds ?? []);
  const home = pathname === '/home';
  return (
    <nav aria-label={t('shell.nav.primary')} className="rail dock-glass max-md:hidden" data-testid="rail">
      <Tooltip content={t('shell.nav.home')} side="right">
        <Link
          to="/home"
          className="rail-orb"
          aria-label={t('shell.nav.home')}
          aria-current={home ? 'page' : undefined}
          onClick={() => !home && playSound('click')}
        >
          <LogoMark className="size-8" />
        </Link>
      </Tooltip>
      <RailButton
        to="/dm"
        label={t('shell.nav.messages')}
        active={pathname.startsWith('/dm')}
        badge={dmMentions}
        testId="rail-dms"
      >
        <MessageCircle />
      </RailButton>
      <RailButton
        to="/notifications"
        label={t('shell.nav.notifications')}
        active={pathname.startsWith('/notifications')}
        badge={notifications}
        testId="rail-notifications"
      >
        <Bell />
      </RailButton>
      <RailButton to="/search" label={t('shell.nav.search')} active={pathname.startsWith('/search')}>
        <Search />
      </RailButton>
      <RailButton to="/explore" label={t('shell.nav.explore')} active={pathname.startsWith('/explore')}>
        <Compass />
      </RailButton>
      <span aria-hidden className="rail-sep" />
      <ul aria-label={t('shell.nav.yourCommunities')} className="rail-list no-scrollbar">
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
          <RailButton
            onClick={() => setCreateOpen(true)}
            label={t('shell.nav.addCommunity')}
            testId="rail-add-community"
          >
            <Plus className="text-[var(--presence-online)]" />
          </RailButton>
        </li>
      </ul>
      <RailFoot />
      <CreateJoinDialog open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}
