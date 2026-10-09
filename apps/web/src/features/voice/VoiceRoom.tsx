import { Headphones, PhoneOff } from 'lucide-react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useSession } from '../../stores/session';
import { useVoice } from '../../stores/voice';
import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/ui/tooltip';
import { VoiceAvatar } from './VoiceParts';

/** Header button: join this conversation's voice room (or leave it). */
export function VoiceJoinButton({ channelId, name }: { channelId: string; name: string }) {
  const enabled = useSession((s) => s.config?.voice.enabled ?? false);
  const status = useVoice((s) => s.status);
  const current = useVoice((s) => s.channelId);
  const count = useVoice((s) => s.rooms[channelId]?.length ?? 0);
  if (!enabled) return null;
  const here = current === channelId && status !== 'idle';
  return (
    <Tooltip content={here ? t('voice.leave') : t('voice.joinNamed', { name })}>
      <Button
        variant={here ? 'danger' : 'ghost'}
        size="icon"
        // On phones the call bar already has the hang-up button.
        className={cn('relative rounded-full', here && 'max-md:hidden')}
        aria-label={here ? t('voice.leave') : t('voice.join')}
        onClick={() => (here ? useVoice.getState().leave() : void useVoice.getState().join(channelId))}
        data-testid="voice-join"
      >
        {here ? <PhoneOff className="size-[18px]" /> : <Headphones className="size-[18px]" />}
        {!here && count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--presence-online)] px-1 text-[10px] font-bold text-accent-fg">
            {count}
          </span>
        )}
      </Button>
    </Tooltip>
  );
}

/**
 * Who is in this conversation's voice room, shown above the messages: speaking rings and mute
 * marks for your own call, and a join button when you are not in it.
 */
export function VoiceRoomStrip({ channelId }: { channelId: string }) {
  const enabled = useSession((s) => s.config?.voice.enabled ?? false);
  const room = useVoice((s) => s.rooms[channelId]);
  const inCall = useVoice((s) => s.channelId === channelId && s.status !== 'idle');
  const peers = useVoice((s) => s.peers);
  const selfPeer = useVoice((s) => s.peerId);
  const speaking = useVoice((s) => s.speaking);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  if (!enabled || (!room?.length && !inCall)) return null;
  const list = room ?? [];
  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-line-subtle bg-hover px-4 py-2 animate-fade-in"
      data-testid="voice-room"
    >
      <span className="text-xs font-semibold text-accent-text">
        {t('voice.inRoom', { count: Math.max(list.length, inCall ? 1 : 0) })}
      </span>
      <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar">
        {list.map((p) => {
          const self = p.peerId === selfPeer;
          const view = peers[p.peerId];
          return (
            <li key={p.peerId} className={cn('flex shrink-0 items-center gap-1.5', !p.connected && 'opacity-60')}>
              <VoiceAvatar
                user={p.user}
                speaking={self ? speaking : (view?.speaking ?? false)}
                muted={self ? muted : p.muted}
                deafened={self ? deafened : p.deafened}
                size="xs"
              />
              <span className="text-xs text-fg-2">{self ? t('voice.you') : p.user.displayName}</span>
            </li>
          );
        })}
      </ul>
      {!inCall && (
        <Button
          size="sm"
          variant="primary"
          className="rounded-full"
          onClick={() => void useVoice.getState().join(channelId)}
        >
          <Headphones /> {t('voice.join')}
        </Button>
      )}
    </div>
  );
}

/** Sidebar: the people in a channel's voice room, under the channel name. */
export function VoiceSidebarPeers({ channelId }: { channelId: string }) {
  const room = useVoice((s) => s.rooms[channelId]);
  const peers = useVoice((s) => s.peers);
  if (!room?.length) return null;
  return (
    <ul className="mb-1 ml-9 flex flex-col gap-0.5" aria-label={t('voice.inChannel')}>
      {room.slice(0, 8).map((p) => (
        <li key={p.peerId} className="flex items-center gap-2 text-xs text-fg-2">
          <VoiceAvatar
            user={p.user}
            speaking={peers[p.peerId]?.speaking ?? false}
            muted={p.muted}
            deafened={p.deafened}
            size="xs"
          />
          <span className="truncate">{p.user.displayName}</span>
        </li>
      ))}
      {room.length > 8 && <li className="text-xs text-fg-muted">+{room.length - 8}</li>}
    </ul>
  );
}
