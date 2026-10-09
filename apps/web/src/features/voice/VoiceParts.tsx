import type { UserSummary } from '@creator-network/shared';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff } from 'lucide-react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { dmDisplayName, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { useVoice } from '../../stores/voice';
import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/ui/tooltip';
import { UserAvatar } from '../../components/user/UserAvatar';

/** Name and link of the conversation a voice room belongs to. */
export function useVoicePlace(channelId: string | null): { name: string; href: string } | null {
  const communities = useChat((s) => s.communities);
  const dms = useChat((s) => s.dms);
  const self = useSession((s) => s.user);
  if (!channelId) return null;
  const dm = dms[channelId];
  if (dm) return { name: dmDisplayName(dm, self?.id ?? ''), href: `/dm/${channelId}` };
  for (const c of Object.values(communities)) {
    const ch = c.channels.find((x) => x.id === channelId);
    if (ch) return { name: `#${ch.name} · ${c.name}`, href: `/c/${c.id}/${ch.id}` };
  }
  return null;
}

/** A person in voice: picture with a glowing ring while speaking, and their mute state. */
export function VoiceAvatar({
  user,
  speaking,
  muted,
  deafened,
  size = 'sm',
  className,
}: {
  user: UserSummary;
  speaking?: boolean;
  muted?: boolean;
  deafened?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'rounded-avatar transition-shadow duration-[var(--dur-fast)]',
          speaking && 'shadow-[0_0_0_2px_var(--presence-online),0_0_12px_2px_var(--presence-online)]',
        )}
        data-speaking={speaking || undefined}
      >
        <UserAvatar name={user.displayName} src={user.avatarUrl} size={size} />
      </span>
      {(muted || deafened) && (
        <span
          className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-elevated text-danger shadow-sm"
          aria-label={deafened ? t('voice.deafened') : t('voice.muted')}
        >
          {deafened ? <HeadphoneOff className="size-2.5" /> : <MicOff className="size-2.5" />}
        </span>
      )}
    </span>
  );
}

/** Mute, deafen and hang up: the same controls wherever the call is shown. */
export function VoiceControls({ compact }: { compact?: boolean }) {
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const v = useVoice.getState();
  const size = compact ? 'icon-sm' : 'icon';
  return (
    <div className="flex items-center gap-1">
      <Tooltip content={muted ? t('voice.unmute') : t('voice.mute')}>
        <Button
          variant={muted ? 'danger' : 'secondary'}
          size={size}
          className="rounded-full"
          aria-label={t('voice.mute')}
          aria-pressed={muted}
          onClick={v.toggleMute}
          data-testid="voice-mute"
        >
          {muted ? <MicOff /> : <Mic />}
        </Button>
      </Tooltip>
      <Tooltip content={deafened ? t('voice.undeafen') : t('voice.deafen')}>
        <Button
          variant={deafened ? 'danger' : 'secondary'}
          size={size}
          className="rounded-full"
          aria-label={t('voice.deafen')}
          aria-pressed={deafened}
          onClick={v.toggleDeafen}
          data-testid="voice-deafen"
        >
          {deafened ? <HeadphoneOff /> : <Headphones />}
        </Button>
      </Tooltip>
      <Tooltip content={t('voice.leave')}>
        <Button
          variant="danger"
          size={size}
          className="rounded-full"
          aria-label={t('voice.leave')}
          onClick={v.leave}
          data-testid="voice-leave"
        >
          <PhoneOff />
        </Button>
      </Tooltip>
    </div>
  );
}

/** Your microphone level: a glossy bar (green while you are actually sending). */
export function InputLevel({ className }: { className?: string }) {
  const level = useVoice((s) => s.level);
  const transmitting = useVoice((s) => s.transmitting);
  return (
    <span
      role="meter"
      aria-label={t('voice.prefs.level')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      className={cn('relative block h-1.5 w-16 overflow-hidden rounded-full border border-line bg-inset', className)}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-100',
          transmitting ? 'bg-[var(--presence-online)]' : 'bg-fg-faint',
        )}
        style={{ transform: `scaleX(${Math.max(0.02, level)})` }}
      />
    </span>
  );
}
