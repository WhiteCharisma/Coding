import type { AttachmentDTO } from '@creator-network/shared';
import { Download, File, FileArchive, FileAudio, FileText, Pause, Play } from 'lucide-react';
import { memo, useMemo, useState, type KeyboardEvent } from 'react';
import { t } from '../../i18n';
import { seekTo, togglePlay, usePlayer } from '../../lib/audio';
import { cn } from '../../lib/cn';
import { formatBytes, formatDuration, hueFor } from '../../lib/format';
import { Dialog, DialogContent } from '../../components/ui/dialog';

const downloadUrl = (a: AttachmentDTO) => `${a.url}?download=1`;

function extLabel(a: AttachmentDTO): string {
  const ext = a.name.includes('.') ? a.name.split('.').pop() : a.mime.split('/').pop();
  return (ext ?? '').toUpperCase().slice(0, 5);
}

/** Decorative fallback bars when no waveform was computed (e.g. unsupported codec in the uploader's browser). */
function fallbackPeaks(seed: string, n = 64): number[] {
  let h = hueFor(seed) + 7;
  return Array.from({ length: n }, (_, i) => {
    h = (h * 9301 + 49297) % 233280;
    return Math.round(25 + (h / 233280) * 45 + Math.sin(i / 3) * 10);
  });
}

function Waveform({ peaks, className }: { peaks: number[]; className?: string }) {
  const w = peaks.length * 3;
  return (
    <svg viewBox={`0 0 ${w} 40`} preserveAspectRatio="none" className={cn('h-full w-full', className)} aria-hidden>
      {peaks.map((p, i) => {
        const h = Math.max(2, (p / 100) * 38);
        return <rect key={i} x={i * 3} y={(40 - h) / 2} width="2" height={h} rx="1" fill="currentColor" />;
      })}
    </svg>
  );
}

export const AudioCard = memo(function AudioCard({ a }: { a: AttachmentDTO }) {
  const isCurrent = usePlayer((s) => s.src === a.url);
  const playing = usePlayer((s) => s.src === a.url && s.playing);
  const current = usePlayer((s) => (s.src === a.url ? s.current : 0));
  const playerDuration = usePlayer((s) => (s.src === a.url ? s.duration : 0));
  const error = usePlayer((s) => (s.src === a.url ? s.error : null));
  const durationSec = playerDuration || (a.durationMs ?? 0) / 1000;
  const progress = durationSec > 0 ? Math.min(1, current / durationSec) : 0;
  const peaks = useMemo(() => a.waveform ?? fallbackPeaks(a.name), [a.waveform, a.name]);
  const title = a.name.replace(/\.[a-z0-9]+$/i, '');

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      seekTo(a.url, Math.max(0, Math.min(1, progress + (e.key === 'ArrowRight' ? 0.05 : -0.05))), durationSec);
    }
  };

  return (
    <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-elevated/70 p-3 pr-2 shadow-sm">
      <button
        type="button"
        onClick={() => togglePlay(a.url, (a.durationMs ?? 0) / 1000)}
        aria-label={playing ? t('chat.attachments.pause', { name: title }) : t('chat.attachments.play', { name: title })}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full transition-[transform,background-color] duration-[var(--dur-fast)] active:scale-95',
          playing ? 'bg-accent text-accent-fg shadow-glow' : 'bg-accent text-accent-fg hover:bg-accent-hover',
        )}
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-ui font-semibold text-fg" title={a.name}>
            {title}
          </p>
          <span className="shrink-0 font-mono text-[11px] text-fg-muted tabular-nums">
            {isCurrent ? `${formatDuration(current * 1000)} / ` : ''}
            {durationSec ? formatDuration(durationSec * 1000) : '–:––'}
          </span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('chat.attachments.seek', { name: title })}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationSec)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={formatDuration(current * 1000)}
          onKeyDown={onKey}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo(a.url, (e.clientX - rect.left) / rect.width, durationSec);
          }}
          className="relative mt-1.5 h-9 cursor-pointer rounded"
        >
          <Waveform peaks={peaks} className="text-fg-faint/60" />
          <div className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }}>
            <div className="h-full" style={{ width: progress > 0 ? `${100 / progress}%` : '100%' }}>
              <Waveform peaks={peaks} className="text-accent" />
            </div>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[10.5px] tracking-wide text-fg-muted uppercase">
            {extLabel(a)} · {formatBytes(a.size)}
          </span>
          {error && <span className="text-[11px] text-danger">{t('chat.attachments.audioUnsupported')}</span>}
        </div>
      </div>
      <a href={downloadUrl(a)} aria-label={`${t('chat.attachments.download')} ${a.name}`} className="self-start rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg">
        <Download className="size-4" />
      </a>
    </div>
  );
});

function ImageTile({ a, onOpen, single }: { a: AttachmentDTO; onOpen: () => void; single: boolean }) {
  const ratio = a.width && a.height ? a.width / a.height : 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('chat.attachments.open')}
      className={cn('group/img relative block overflow-hidden rounded-lg border border-line-subtle bg-inset', single ? 'max-w-[min(100%,420px)]' : 'aspect-square')}
      style={single ? { aspectRatio: String(ratio), maxHeight: 360, width: ratio >= 1 ? 'min(100%, 420px)' : undefined, height: ratio < 1 ? 360 : undefined } : undefined}
    >
      <img src={a.url} alt={t('chat.attachments.imageAlt', { name: a.name })} loading="lazy" decoding="async" width={a.width ?? undefined} height={a.height ?? undefined} className="size-full object-cover transition-transform duration-[var(--dur-slow)] ease-out group-hover/img:scale-[1.02]" draggable={false} />
    </button>
  );
}

function FileCard({ a }: { a: AttachmentDTO }) {
  const Icon = a.mime === 'application/zip' ? FileArchive : a.mime === 'application/pdf' || a.mime === 'text/plain' ? FileText : a.kind === 'audio' ? FileAudio : File;
  return (
    <a href={downloadUrl(a)} className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-line bg-elevated/70 p-3 transition-colors hover:border-line-strong">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium text-fg">{a.name}</span>
        <span className="font-mono text-[11px] text-fg-muted uppercase">
          {extLabel(a)} · {formatBytes(a.size)}
        </span>
      </span>
      <Download className="size-4 text-fg-muted" />
    </a>
  );
}

export const Attachments = memo(function Attachments({ items }: { items: AttachmentDTO[] }) {
  const [open, setOpen] = useState<AttachmentDTO | null>(null);
  const images = items.filter((a) => a.kind === 'image');
  const others = items.filter((a) => a.kind !== 'image');
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {images.length > 0 && (
        <div className={cn(images.length === 1 ? 'flex' : 'grid max-w-[420px] grid-cols-2 gap-1.5')}>
          {images.map((a) => (
            <ImageTile key={a.id} a={a} single={images.length === 1} onOpen={() => setOpen(a)} />
          ))}
        </div>
      )}
      {others.map((a) =>
        a.kind === 'audio' ? (
          <AudioCard key={a.id} a={a} />
        ) : a.kind === 'video' ? (
          <video key={a.id} src={a.url} controls preload="none" className="max-h-80 w-full max-w-md rounded-lg border border-line-subtle bg-black" />
        ) : (
          <FileCard key={a.id} a={a} />
        ),
      )}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent title={open.name} size="xl" description={`${open.width ?? '?'}×${open.height ?? '?'} · ${formatBytes(open.size)}`}>
            <div className="flex flex-col items-center gap-3">
              <img src={open.url} alt={t('chat.attachments.imageAlt', { name: open.name })} className="max-h-[70dvh] w-auto rounded-lg object-contain" />
              <a href={downloadUrl(open)} className="inline-flex items-center gap-2 text-sm font-medium text-accent-text hover:underline">
                <Download className="size-4" /> {t('chat.attachments.download')}
              </a>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
});
