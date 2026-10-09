import { Activity, AudioLines, Settings2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { t, type TKey } from '../../i18n';
import { cn } from '../../lib/cn';
import { useVoice, type PeerView } from '../../stores/voice';
import { Button, buttonVariants } from '../../components/ui/button';
import { Orb } from '../../components/ui/orb';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Spinner } from '../../components/ui/spinner';
import { toast } from '../../components/ui/toast';
import { Tooltip } from '../../components/ui/tooltip';
import { InputLevel, useVoicePlace, VoiceAvatar, VoiceControls } from './VoiceParts';

const kbps = (bps: number | null) => (bps === null ? null : t('voice.kbps', { value: Math.round(bps / 1000) }));

/** What getStats() measured for each connection: the real bitrate, codec and route. */
function ConnectionDetails({ peers }: { peers: PeerView[] }) {
  const stats = useVoice((s) => s.stats);
  return (
    <div className="flex w-80 flex-col gap-3 p-3" data-testid="voice-details">
      <div>
        <p className="text-sm font-semibold text-fg">{t('voice.details')}</p>
        <p className="text-xs text-fg-muted">{t('voice.detailsHint')}</p>
      </div>
      {peers.length === 0 && <p className="text-sm text-fg-muted">{t('voice.measuring')}</p>}
      {peers.map((p) => {
        const s = stats[p.peerId];
        const route =
          s?.route === 'relay'
            ? t('voice.routeRelay')
            : s?.route === 'srflx'
              ? t('voice.routeStun')
              : t('voice.routeDirect');
        const rows: [string, string | null][] = [
          [t('voice.sending'), kbps(s?.sendBitrate ?? null)],
          [t('voice.receiving'), kbps(s?.receiveBitrate ?? null)],
          [
            t('voice.codec'),
            s?.codec
              ? `${s.codec.replace('audio/', '')} · ${s.fmtp?.includes('stereo=1') ? t('voice.stereo') : t('voice.mono')}`
              : null,
          ],
          [t('voice.route'), s?.route ? route : null],
          [t('voice.latency'), s?.roundTripMs != null ? `${Math.round(s.roundTripMs)} ms` : null],
          [t('voice.loss'), s?.loss != null ? `${(s.loss * 100).toFixed(1)} %` : null],
        ];
        return (
          <div key={p.peerId} className="tile p-2.5">
            <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-fg">
              <VoiceAvatar user={p.user} size="xs" /> {p.user.displayName}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="text-right font-mono text-fg-2 tabular-nums" data-stat={label}>
                    {value ?? t('voice.measuring')}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function PushToTalkButton() {
  const key = useVoice((s) => s.settings.pttKey);
  const transmitting = useVoice((s) => s.transmitting);
  const hold = (held: boolean) => useVoice.getState().setPushToTalk(held);
  return (
    <Tooltip content={t('voice.pushToTalkHint', { key: key.replace(/^Key|^Digit/, '') })}>
      <Button
        size="sm"
        variant={transmitting ? 'primary' : 'secondary'}
        className="rounded-full select-none"
        onPointerDown={() => hold(true)}
        onPointerUp={() => hold(false)}
        onPointerLeave={() => hold(false)}
        onPointerCancel={() => hold(false)}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && hold(true)}
        onKeyUp={() => hold(false)}
      >
        {t('voice.pushToTalk')}
      </Button>
    </Tooltip>
  );
}

/** Shows voice errors once, in words (permission refused, no microphone, room full…). */
export function VoiceErrors() {
  const error = useVoice((s) => s.error);
  useEffect(() => {
    if (!error) return;
    toast.error(t(`voice.errors.${error}` as TKey));
    useVoice.getState().clearError();
  }, [error]);
  return null;
}

/** The call bar: visible on every page while you are in a voice room. */
export function VoiceDock() {
  const status = useVoice((s) => s.status);
  const channelId = useVoice((s) => s.channelId);
  const peers = useVoice((s) => s.peers);
  const speaking = useVoice((s) => s.speaking);
  const ptt = useVoice((s) => s.settings.ptt);
  const mode = useVoice((s) => s.settings.mode);
  const place = useVoicePlace(channelId);
  if (status === 'idle' || !channelId) return null;
  const list = Object.values(peers);
  const label =
    status === 'connected' ? t('voice.connected') : status === 'joining' ? t('voice.joining') : t('voice.reconnecting');
  return (
    <section
      aria-label={t('voice.connected')}
      className="glass pane flex shrink-0 items-center gap-3 bg-elevated px-3 py-2 animate-rise-in max-md:rounded-none max-md:border-x-0"
      data-testid="voice-dock"
      data-status={status}
    >
      <Orb
        icon={AudioLines}
        size="sm"
        className={cn(
          'transition-shadow',
          speaking && 'shadow-[0_0_0_2px_var(--presence-online),0_0_14px_var(--presence-online)]',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg" role="status">
          {status !== 'connected' && <Spinner className="size-3.5" />}
          {label}
          <span className="rounded-full border border-line px-1.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
            {mode === 'studio' ? t('voice.prefs.modeStudio') : t('voice.prefs.modeVoice')}
          </span>
        </p>
        {place && (
          <Link to={place.href} className="block truncate text-xs text-fg-muted hover:text-fg hover:underline">
            {place.name}
          </Link>
        )}
      </div>
      <div className="hidden items-center -space-x-1.5 sm:flex">
        {list.slice(0, 6).map((p) => (
          <Tooltip key={p.peerId} content={p.user.displayName}>
            <span>
              <VoiceAvatar user={p.user} speaking={p.speaking} muted={p.muted} deafened={p.deafened} size="xs" />
            </span>
          </Tooltip>
        ))}
      </div>
      <InputLevel className="hidden md:block" />
      {ptt && <PushToTalkButton />}
      <Popover>
        <Tooltip content={t('voice.details')}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={t('voice.details')}>
              <Activity />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent side="bottom" align="end" className="p-0">
          <ConnectionDetails peers={list} />
        </PopoverContent>
      </Popover>
      <Tooltip content={t('voice.settings')}>
        <Link
          to="/settings/voice"
          aria-label={t('voice.settings')}
          className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'rounded-full' })}
        >
          <Settings2 />
        </Link>
      </Tooltip>
      <VoiceControls compact />
    </section>
  );
}
