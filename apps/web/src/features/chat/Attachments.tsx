import type { AttachmentDTO } from '@creator-network/shared';
import { Download, File, FileArchive, FileAudio, FileText, Film, Pause, Play } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../../i18n';
import { seekTo, togglePlay, usePlayer } from '../../lib/audio';
import { cn } from '../../lib/cn';
import { formatBytes, formatDuration, hueFor } from '../../lib/format';
import { localUrlFor, useUploads, type DisplayAttachment } from '../../stores/uploads';
import { buttonVariants } from '../../components/ui/button';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Orb } from '../../components/ui/orb';

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
    <div className="tile flex w-full max-w-md items-center gap-3 p-3 pr-2">
      <button
        type="button"
        onClick={() => togglePlay(a.url, (a.durationMs ?? 0) / 1000)}
        aria-label={
          playing ? t('chat.attachments.pause', { name: title }) : t('chat.attachments.play', { name: title })
        }
        className={cn(
          'gloss sheen-hover grid size-11 shrink-0 place-items-center rounded-full border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-accent-fg transition-[transform,box-shadow,filter] duration-[var(--dur-fast)] hover:brightness-105 active:scale-95',
          playing ? 'shadow-glow' : 'shadow-[0_4px_12px_-6px_var(--accent-glow)]',
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
          <div
            className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-300 ease-linear"
            style={{ width: `${progress * 100}%` }}
          >
            <div className="h-full" style={{ width: progress > 0 ? `${100 / progress}%` : '100%' }}>
              <Waveform peaks={peaks} className="text-accent-text" />
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
      <a
        href={downloadUrl(a)}
        aria-label={`${t('chat.attachments.download')} ${a.name}`}
        className="self-start rounded-full p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <Download className="size-4" />
      </a>
    </div>
  );
});

/** Upload progress of a file in a message that is still being sent. */
function UploadProgress({ uploadKey, overlay }: { uploadKey: string; overlay?: boolean }) {
  const job = useUploads((s) => s.jobs[uploadKey]);
  if (!job || job.status === 'done') return null;
  const failed = job.status === 'error';
  return (
    <span
      className={cn(
        'flex items-center gap-2 text-[11px] font-medium',
        overlay ? 'absolute inset-x-2 bottom-2 rounded-md bg-scrim px-2 py-1 text-white' : 'mt-1 text-fg-muted',
      )}
      role="status"
    >
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
        <span
          className={cn(
            'block h-full origin-left rounded-full transition-transform duration-200',
            failed ? 'bg-danger' : 'bg-accent',
          )}
          style={{ transform: `scaleX(${failed ? 1 : Math.max(0.04, job.progress)})` }}
        />
      </span>
      <span className="tabular-nums">
        {failed ? t('chat.composer.uploadFailed') : `${Math.round(job.progress * 100)}%`}
      </span>
    </span>
  );
}

/**
 * Shows the small server preview (or, for the sender, the local copy of the file), fades it in
 * once decoded, and keeps the space reserved from the known dimensions so nothing jumps.
 */
function ImageTile({ a, onOpen, single }: { a: DisplayAttachment; onOpen: () => void; single: boolean }) {
  const job = useUploads((s) => (a.uploadKey ? s.jobs[a.uploadKey] : undefined));
  const src = (a.uploadKey ? job?.localUrl : localUrlFor(a.id)) ?? a.previewUrl ?? a.url;
  const width = a.width ?? job?.width ?? null;
  const height = a.height ?? job?.height ?? null;
  const ratio = width && height ? width / height : 4 / 3;
  const img = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useLayoutEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true);
  }, [src]);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!!a.uploadKey}
      aria-label={t('chat.attachments.open')}
      className={cn(
        'photo-frame group/img relative block overflow-hidden rounded-xl bg-inset shadow-sm',
        single ? 'max-w-[min(100%,420px)]' : 'aspect-square',
        !loaded && 'skeleton',
      )}
      style={
        single
          ? {
              aspectRatio: String(ratio),
              maxHeight: 360,
              width: ratio >= 1 ? 'min(100%, 420px)' : undefined,
              height: ratio < 1 ? 360 : undefined,
            }
          : undefined
      }
    >
      {src && (
        <img
          ref={img}
          src={src}
          alt={t('chat.attachments.imageAlt', { name: a.name })}
          loading="lazy"
          decoding="async"
          width={width ?? undefined}
          height={height ?? undefined}
          onLoad={() => setLoaded(true)}
          className={cn(
            'size-full object-cover transition-[opacity,transform] duration-[var(--dur-slow)] ease-out group-hover/img:scale-[1.02]',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          draggable={false}
        />
      )}
      {a.uploadKey && <UploadProgress uploadKey={a.uploadKey} overlay />}
    </button>
  );
}

/** A file in a message that is still uploading (audio, video and documents). */
function UploadingCard({ a }: { a: DisplayAttachment }) {
  const Icon = a.kind === 'audio' ? FileAudio : a.kind === 'video' ? Film : FileText;
  return (
    <div className="tile flex w-full max-w-sm items-center gap-3 p-3">
      <Orb icon={Icon} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium text-fg">{a.name}</span>
        <span className="font-mono text-[11px] text-fg-muted uppercase">
          {extLabel(a)} · {formatBytes(a.size)}
        </span>
        {a.uploadKey && <UploadProgress uploadKey={a.uploadKey} />}
      </span>
    </div>
  );
}

/** Full-size view: the preview appears at once, the original replaces it when it has loaded. */
function ImageViewer({ a }: { a: AttachmentDTO }) {
  const quick = localUrlFor(a.id) ?? a.previewUrl;
  const [originalLoaded, setOriginalLoaded] = useState(false);
  return (
    <div className="relative grid place-items-center">
      {quick && !originalLoaded && (
        <img
          src={quick}
          alt=""
          aria-hidden
          className="col-start-1 row-start-1 max-h-[70dvh] w-auto rounded-lg object-contain"
        />
      )}
      <img
        src={a.url}
        alt={t('chat.attachments.imageAlt', { name: a.name })}
        onLoad={() => setOriginalLoaded(true)}
        className={cn(
          'col-start-1 row-start-1 max-h-[70dvh] w-auto rounded-lg object-contain transition-opacity duration-[var(--dur-base)]',
          quick && !originalLoaded ? 'opacity-0' : 'opacity-100',
        )}
        style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
      />
    </div>
  );
}

function FileCard({ a }: { a: AttachmentDTO }) {
  const Icon =
    a.mime === 'application/zip'
      ? FileArchive
      : a.mime === 'application/pdf' || a.mime === 'text/plain'
        ? FileText
        : a.kind === 'audio'
          ? FileAudio
          : File;
  return (
    <a href={downloadUrl(a)} className="tile tile-link flex w-full max-w-sm items-center gap-3 p-3">
      <Orb icon={Icon} size="md" />
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

export const Attachments = memo(function Attachments({ items }: { items: DisplayAttachment[] }) {
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
        a.uploadKey ? (
          <UploadingCard key={a.id} a={a} />
        ) : a.kind === 'audio' ? (
          <AudioCard key={a.id} a={a} />
        ) : a.kind === 'video' ? (
          <video
            key={a.id}
            src={a.url}
            controls
            preload="none"
            className="max-h-80 w-full max-w-md rounded-xl border border-glass-edge bg-black shadow-sm"
          />
        ) : (
          <FileCard key={a.id} a={a} />
        ),
      )}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent
            title={open.name}
            size="xl"
            description={`${open.width ?? '?'}×${open.height ?? '?'} · ${formatBytes(open.size)}`}
          >
            <div className="flex flex-col items-center gap-3">
              <ImageViewer a={open} />
              <a href={downloadUrl(open)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Download /> {t('chat.attachments.download')}
              </a>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
});
