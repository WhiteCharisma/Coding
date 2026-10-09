import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import { fileTypeFromFile } from 'file-type';
import { imageSizeFromFile } from 'image-size/fromFile';
import { LIMITS, UPLOAD_MIME_GROUPS, uploadKindForMime, type UploadKind } from '@creator-network/shared';
import { getChannelAccess } from '../communities/access';
import type { AppContext } from '../context';
import { newId } from '../db/ids';
import { uploads } from '../db/schema';
import { AppError, badRequest, notFound, tooLarge, unsupported } from '../lib/errors';
import type { UserRow } from '../users/dto';
import { stripLocationMetadata } from './metadata';
import { ensurePreview, hasPreview, previewKeyFor } from './previews';

export type UploadRow = typeof uploads.$inferSelect;
export type UploadPurpose = UploadRow['purpose'];

const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;
const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Some detectors report legacy aliases; normalise to the names in the allowlist. */
const MIME_ALIASES: Record<string, string> = {
  'audio/x-wav': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-midi': 'audio/midi',
  'audio/mid': 'audio/midi',
  'application/x-zip-compressed': 'application/zip',
};

export function sanitizeFileName(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, '/'));
  const cleaned = base
    // eslint-disable-next-line no-control-regex -- strip control and bidi-override characters
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  const limited = cleaned.length > 120 ? cleaned.slice(cleaned.length - 120) : cleaned;
  return limited || 'file';
}

/** Storage path derived from the random part of the ID; never from user input. */
export function storageKeyFor(id: string): string {
  return path.posix.join(id.slice(-2).toLowerCase(), id.slice(-4, -2).toLowerCase(), id);
}

export function resolveStoragePath(ctx: AppContext, storageKey: string): string {
  const full = path.resolve(ctx.config.uploadsDir, storageKey);
  // Defence in depth against path traversal: the key must stay inside the uploads directory.
  if (!full.startsWith(path.resolve(ctx.config.uploadsDir) + path.sep)) throw notFound();
  return full;
}

async function isPlainText(file: string): Promise<boolean> {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    const chunk = buf.subarray(0, bytesRead);
    if (chunk.includes(0)) return false;
    new TextDecoder('utf-8', { fatal: true }).decode(chunk.subarray(0, Math.max(0, bytesRead - 4)));
    return true;
  } catch {
    return false;
  } finally {
    await handle.close();
  }
}

export interface IncomingFile {
  filename: string;
  mimetype: string;
  stream: NodeJS.ReadableStream;
}

export interface UploadMeta {
  waveform?: number[] | null;
  durationMs?: number | null;
}

const NO_AUDIO_META = { waveform: null, durationMs: null };

/** Waveform peaks and duration are computed by the uploader's browser: keep only well-formed values. */
function cleanAudioMeta(meta: UploadMeta): { waveform: number[] | null; durationMs: number | null } {
  const w = meta.waveform;
  const waveform =
    Array.isArray(w) &&
    w.length > 0 &&
    w.length <= LIMITS.waveformPeaks &&
    w.every((v) => Number.isInteger(v) && v >= 0 && v <= 100)
      ? w
      : null;
  const d = meta.durationMs;
  const durationMs = typeof d === 'number' && Number.isFinite(d) && d > 0 && d < 24 * 3600_000 ? Math.round(d) : null;
  return { waveform, durationMs };
}

/**
 * Sets the waveform/duration of an audio upload after the fact: the browser starts the upload
 * right away and analyses the file in parallel, instead of decoding it first. Only the uploader
 * may do this, and only before the file is attached to a message.
 */
export function setAudioMeta(ctx: AppContext, user: UserRow, uploadId: string, meta: UploadMeta): UploadRow {
  const row = ctx.db.select().from(uploads).where(eq(uploads.id, uploadId)).get();
  if (!row || row.uploaderId !== user.id || row.status !== 'pending' || uploadKindForMime(row.mime) !== 'audio') {
    throw notFound('File not found.');
  }
  const clean = cleanAudioMeta(meta);
  ctx.db.update(uploads).set(clean).where(eq(uploads.id, uploadId)).run();
  return { ...row, ...clean };
}

/** Where an upload's server time went (sent as a Server-Timing header). */
export interface UploadTimings {
  receiveMs: number;
  inspectMs: number;
  storeMs: number;
}

/**
 * Streams an upload to disk, enforces the size limit while streaming, detects
 * the real type from the file signature, validates it against the allowlist for
 * the purpose, and stores it under a random name outside any served directory.
 */
export async function storeUpload(
  ctx: AppContext,
  user: UserRow,
  file: IncomingFile,
  opts: { purpose: UploadPurpose; channelId?: string | null; meta?: UploadMeta; timings?: UploadTimings },
): Promise<UploadRow> {
  const started = performance.now();
  const isProfileImage = opts.purpose !== 'attachment';
  const limitBytes = isProfileImage ? PROFILE_IMAGE_MAX_BYTES : ctx.settings.get().maxUploadMb * 1024 * 1024;
  const id = newId();
  const tmpDir = path.join(ctx.config.uploadsDir, 'tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${id}.part`);

  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > limitBytes) {
        cb(tooLarge(`Files can be at most ${Math.round(limitBytes / 1024 / 1024)} MB.`));
        return;
      }
      cb(null, chunk);
    },
  });

  try {
    await pipeline(file.stream, counter, createWriteStream(tmpPath, { mode: 0o600 }));
    if ((file.stream as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
      throw tooLarge(`Files can be at most ${Math.round(limitBytes / 1024 / 1024)} MB.`);
    }
    if (size === 0) throw badRequest('The file is empty.');
    const received = performance.now();

    const detected = await fileTypeFromFile(tmpPath);
    let mime = detected ? (MIME_ALIASES[detected.mime] ?? detected.mime) : null;
    if (!mime && /\.(txt|md|text)$/i.test(file.filename) && (await isPlainText(tmpPath))) mime = 'text/plain';
    const kind: UploadKind | null = mime ? uploadKindForMime(mime) : null;
    if (!mime || !kind) {
      throw unsupported(
        'That file type is not supported. Use images (PNG, JPEG, GIF, WebP), audio (MP3, WAV, OGG, FLAC, M4A), video (MP4, WebM), PDF, ZIP or text files.',
      );
    }
    if (isProfileImage && kind !== 'image')
      throw unsupported('Profile pictures and icons must be PNG, JPEG, GIF or WebP images.');

    let width: number | null = null;
    let height: number | null = null;
    if (kind === 'image') {
      // Photos often carry the place they were taken. Remove it (and XMP/IPTC) without
      // re-encoding: the stored original keeps its exact quality.
      if (await stripLocationMetadata(tmpPath, mime)) size = (await fs.stat(tmpPath)).size;
      try {
        const dim = await imageSizeFromFile(tmpPath);
        width = dim.width ?? null;
        height = dim.height ?? null;
      } catch {
        throw unsupported('That image could not be read.');
      }
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
        throw badRequest(
          `Images can be at most ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.`,
          undefined,
          'image_too_large',
        );
      }
    }

    const { waveform, durationMs } = kind === 'audio' && opts.meta ? cleanAudioMeta(opts.meta) : NO_AUDIO_META;

    const inspected = performance.now();
    const storageKey = storageKeyFor(id);
    const finalPath = resolveStoragePath(ctx, storageKey);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.rename(tmpPath, finalPath);

    const row: UploadRow = {
      id,
      uploaderId: user.id,
      purpose: opts.purpose,
      channelId: opts.channelId ?? null,
      messageId: null,
      name: sanitizeFileName(file.filename),
      mime,
      size,
      storageKey,
      width,
      height,
      durationMs,
      waveform,
      status: 'pending',
      createdAt: Date.now(),
    };
    ctx.db.insert(uploads).values(row).run();
    // Background: the preview is usually ready before anyone opens the message.
    if (hasPreview(row)) void ensurePreview(ctx, row, (key) => resolveStoragePath(ctx, key));
    if (opts.timings) {
      opts.timings.receiveMs = received - started;
      opts.timings.inspectMs = inspected - received;
      opts.timings.storeMs = performance.now() - inspected;
    }
    return row;
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

/** Authorises access to a stored file. Throws 404 for anything the user may not see. */
export function authorizeFile(ctx: AppContext, user: UserRow, uploadId: string): UploadRow {
  const row = ctx.db.select().from(uploads).where(eq(uploads.id, uploadId)).get();
  if (!row || row.status === 'deleted') throw notFound('File not found.');
  if (row.purpose === 'avatar' || row.purpose === 'community_icon') {
    if (row.status !== 'attached' && row.uploaderId !== user.id) throw notFound('File not found.');
    return row;
  }
  if (row.status === 'pending') {
    if (row.uploaderId !== user.id) throw notFound('File not found.');
    return row;
  }
  if (!row.channelId || !row.messageId) throw notFound('File not found.');
  if (!getChannelAccess(ctx.db, row.channelId, user.id)) throw notFound('File not found.');
  return row;
}

const INLINE_KINDS = new Set<UploadKind>(['image', 'audio', 'video']);

export function fileDisposition(row: UploadRow, forceDownload: boolean): string {
  const kind = uploadKindForMime(row.mime);
  const type = !forceDownload && kind && INLINE_KINDS.has(kind) ? 'inline' : 'attachment';
  const ascii = row.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`;
}

export interface ByteRange {
  start: number;
  end: number;
}

/** Parses a single "bytes=" range. Returns null for absent/unsupported ranges, 'invalid' when unsatisfiable. */
export function parseRange(header: string | undefined, size: number): ByteRange | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw = '', endRaw = ''] = match;
  let start: number;
  let end: number;
  if (startRaw === '' && endRaw === '') return 'invalid';
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

export function openFileStream(ctx: AppContext, row: UploadRow, range?: ByteRange) {
  const full = resolveStoragePath(ctx, row.storageKey);
  return createReadStream(full, range ? { start: range.start, end: range.end } : undefined);
}

export async function deleteStoredFile(ctx: AppContext, storageKey: string): Promise<void> {
  try {
    await fs.rm(resolveStoragePath(ctx, storageKey), { force: true });
    await fs.rm(resolveStoragePath(ctx, previewKeyFor(storageKey)), { force: true });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
  }
}

/** Opens the preview of an image, generating it first if needed; null when it has none. */
export async function openPreviewStream(ctx: AppContext, row: UploadRow) {
  if (!hasPreview(row)) return null;
  if (!(await ensurePreview(ctx, row, (key) => resolveStoragePath(ctx, key)))) return null;
  const full = resolveStoragePath(ctx, previewKeyFor(row.storageKey));
  const { size } = await fs.stat(full);
  return { stream: createReadStream(full), size };
}

export const ACCEPTED_MIME_TYPES = Object.values(UPLOAD_MIME_GROUPS).flat();
