import type { UserSummary } from '@creator-network/shared';
import { Headphones, Mic, MicOff, PhoneOff } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatLongDate } from '../../lib/format';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { useVoice } from '../../stores/voice';
import { PresenceIcon } from '../../components/user/Presence';
import { UserAvatar } from '../../components/user/UserAvatar';
import { useCommunityMembers } from '../community/hooks';
import { useVoicePlace, VoiceAvatar } from '../voice/VoiceParts';
import { AnalogClock, useNow } from './Clock';

function Gadget({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('gadget aero-dark-glass flex flex-col gap-2 p-3', className)}>
      <h2 className="gadget-title">{title}</h2>
      {children}
    </section>
  );
}

function ClockGadget() {
  const now = useNow(60_000);
  return (
    <Gadget title={t('shell.gadgets.clock')} className="items-center">
      <AnalogClock className="size-32 drop-shadow-[0_6px_10px_var(--frame-edge)]" />
      <p className="gadget-text text-center text-sm font-semibold">{formatLongDate(now)}</p>
    </Gadget>
  );
}

/** The current call at a glance, with the same actions as the call bar. */
function VoiceGadget() {
  const enabled = useSession((s) => s.config?.voice.enabled ?? false);
  const status = useVoice((s) => s.status);
  const channelId = useVoice((s) => s.channelId);
  const peers = useVoice((s) => s.peers);
  const muted = useVoice((s) => s.muted);
  const speaking = useVoice((s) => s.speaking);
  const self = useSession((s) => s.user);
  const place = useVoicePlace(channelId);
  const { pathname } = useLocation();
  const here =
    matchPath('/c/:communityId/:channelId', pathname)?.params.channelId ??
    matchPath('/dm/:channelId', pathname)?.params.channelId;
  const herePlace = useVoicePlace(here ?? null);
  if (!enabled) return null;
  const v = useVoice.getState();
  if (status === 'idle' || !place) {
    return (
      <Gadget title={t('shell.gadgets.voice')}>
        <p className="gadget-text text-sm text-taskbar-muted">{t('shell.gadgets.noCall')}</p>
        {here && herePlace && (
          <button type="button" className="gadget-btn h-8 w-full font-semibold" onClick={() => void v.join(here)}>
            <Headphones className="size-4" /> {t('shell.gadgets.joinHere')}
          </button>
        )}
      </Gadget>
    );
  }
  const list = Object.values(peers);
  return (
    <Gadget title={t('shell.gadgets.voice')}>
      <Link to={place.href} className="gadget-text truncate text-sm font-semibold hover:underline">
        {place.name}
      </Link>
      <ul className="flex flex-wrap gap-1.5" aria-label={t('shell.gadgets.participants')}>
        {self && (
          <li>
            <VoiceAvatar user={self} speaking={speaking && !muted} muted={muted} size="sm" />
          </li>
        )}
        {list.map((p) => (
          <li key={p.peerId}>
            <VoiceAvatar user={p.user} speaking={p.speaking} muted={p.muted} deafened={p.deafened} size="sm" />
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="gadget-btn h-8 flex-1"
          aria-label={muted ? t('voice.unmute') : t('voice.mute')}
          aria-pressed={muted}
          onClick={v.toggleMute}
        >
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button
          type="button"
          className="gadget-btn gadget-btn-danger h-8 flex-1"
          aria-label={t('voice.leave')}
          onClick={v.leave}
        >
          <PhoneOff />
        </button>
      </div>
    </Gadget>
  );
}

/** Who is online in the community you are in (or among your conversations). */
function OnlineGadget() {
  const { pathname } = useLocation();
  const communityId = matchPath('/c/:communityId/*', pathname)?.params.communityId ?? null;
  const community = useChat((s) => (communityId ? s.communities[communityId] : undefined));
  const members = useCommunityMembers(community ? communityId : null);
  const dms = useChat((s) => s.dms);
  const presence = useChat((s) => s.presence);
  const self = useSession((s) => s.user);
  const people = new Map<string, UserSummary>();
  if (community) {
    for (const m of members.data ?? []) people.set(m.user.id, m.user);
  } else {
    for (const d of Object.values(dms)) for (const p of d.participants) people.set(p.id, p);
  }
  const online = [...people.values()]
    .filter((u) => u.id !== self?.id && presence[u.id] && presence[u.id] !== 'offline')
    .slice(0, 8);
  return (
    <Gadget title={community ? t('shell.gadgets.onlineIn', { place: community.name }) : t('shell.gadgets.online')}>
      {online.length === 0 ? (
        <p className="gadget-text text-sm text-taskbar-muted">{t('shell.gadgets.nobodyOnline')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {online.map((u) => (
            <li key={u.id}>
              <Link to={`/u/${u.username}`} className="gadget-row flex items-center gap-2 rounded-md px-1 py-0.5">
                <UserAvatar name={u.displayName} src={u.avatarUrl} size="xs" />
                <span className="gadget-text min-w-0 flex-1 truncate text-sm">{u.displayName}</span>
                <PresenceIcon status={presence[u.id] ?? 'offline'} className="size-2.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Gadget>
  );
}

/** Windows Sidebar: gadgets on the desktop beside the window (wide screens). */
export function Gadgets() {
  return (
    <aside
      aria-label={t('shell.gadgets.label')}
      className="no-scrollbar hidden w-[var(--gadgets-width)] shrink-0 flex-col gap-3 overflow-y-auto pb-1 min-[1360px]:flex"
      data-testid="gadgets"
    >
      <ClockGadget />
      <VoiceGadget />
      <OnlineGadget />
    </aside>
  );
}
