/**
 * Image previews: a WebP copy at most PREVIEW_MAX px on its longest side, shown in the chat
 * instead of the original (a 10 MB PNG becomes tens of KB). The original stays untouched for
 * the full-size view and downloads.
 *
 * Previews are generated in the background right after an upload (at most two at a time, so
 * a burst of photos cannot starve other requests) and on demand if someone asks before that
 * finished. They are stored next to the original and deleted with it.
 */
import { access, rename, rm } from 'node:fs/promises';
import sharp from 'sharp';
import type { AppContext } from '../context';
import type { UploadRow } from './service';

export const PREVIEW_MAX = 960;
/** Images this small are shown as they are. */
const PREVIEW_MIN_BYTES = 256 * 1024;
const PREVIEWABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RUNNING = 2;

// Defence in depth: libvips may only parse the formats uploads can contain. Its other
// loaders (SVG, PDF, HEIF, TIFF, …) are blocked even if something slipped past type detection.
sharp.block({ operation: ['VipsForeignLoad'] });
sharp.unblock({
  operation: [
    'VipsForeignLoadJpegFile',
    'VipsForeignLoadPngFile',
    'VipsForeignLoadWebpFile',
    'VipsForeignLoadJpegBuffer',
    'VipsForeignLoadPngBuffer',
    'VipsForeignLoadWebpBuffer',
  ],
});
sharp.cache(false);

/** Whether this upload gets a preview (animated GIFs and small images are shown as uploaded). */
export function hasPreview(row: Pick<UploadRow, 'mime' | 'size' | 'width' | 'height' | 'purpose'>): boolean {
  if (row.purpose !== 'attachment' || !PREVIEWABLE.has(row.mime)) return false;
  return row.size > PREVIEW_MIN_BYTES || (row.width ?? 0) > PREVIEW_MAX || (row.height ?? 0) > PREVIEW_MAX;
}

export const previewKeyFor = (storageKey: string) => `${storageKey}.preview.webp`;

const inflight = new Map<string, Promise<boolean>>();
const waiting: (() => void)[] = [];
let running = 0;

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_RUNNING) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function generate(source: string, target: string): Promise<void> {
  const tmp = `${target}.part`;
  try {
    await sharp(source, { limitInputPixels: 40_000_000, failOn: 'error', sequentialRead: true })
      .rotate() // apply EXIF orientation; the preview carries no metadata
      .resize(PREVIEW_MAX, PREVIEW_MAX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toFile(tmp);
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Makes sure the preview exists. Resolves to false if the image cannot be processed (the
 * client then shows the original). Concurrent calls for the same upload share one job.
 */
export function ensurePreview(ctx: AppContext, row: UploadRow, resolvePath: (key: string) => string): Promise<boolean> {
  const existing = inflight.get(row.id);
  if (existing) return existing;
  const target = resolvePath(previewKeyFor(row.storageKey));
  const job = access(target)
    .then(() => true)
    .catch(() =>
      slot(async () => {
        await generate(resolvePath(row.storageKey), target);
        return true;
      }),
    )
    .catch((err: unknown) => {
      ctx.log.warn({ uploadId: row.id, err: err instanceof Error ? err.message : String(err) }, 'preview failed');
      return false;
    })
    .finally(() => inflight.delete(row.id));
  inflight.set(row.id, job);
  return job;
}
