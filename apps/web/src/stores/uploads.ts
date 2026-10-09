/**
 * Attachment uploads, independent of the composer: they keep running when you switch channels,
 * and a message can be sent before its files finish (it waits for them in the outbox).
 *
 * - Each upload carries a stable key (X-Upload-Key): a retry after a lost response returns the
 *   file the server already stored instead of a duplicate.
 * - Images get an instant local preview (object URL of the original file) and are sent as they
 *   are; the server makes the small chat previews.
 * - Audio starts uploading immediately; the waveform is computed in parallel and added after.
 */
import { uploadKindForMime, type AttachmentDTO, type UploadKind } from '@creator-network/shared';
import { create } from 'zustand';
import { api, ApiError, errorMessage, uploadWithProgress, type UploadHandle } from '../lib/api';
import { computePeaks } from '../lib/audio';
import { prepareImage } from '../lib/image';

export type UploadStatus = 'uploading' | 'done' | 'error';

export interface UploadJob {
  key: string;
  channelId: string;
  name: string;
  size: number;
  mime: string;
  kind: UploadKind;
  /** Object URL of the local file, for an instant preview of images. */
  localUrl: string | null;
  width: number | null;
  height: number | null;
  status: UploadStatus;
  progress: number;
  attachment: AttachmentDTO | null;
  error?: string;
  /** The server refused the file itself (too large, unsupported): retrying cannot help. */
  permanent?: boolean;
}

/** An attachment as shown in the chat: from the server, or still uploading from this device. */
export type DisplayAttachment = AttachmentDTO & { uploadKey?: string };

interface UploadsState {
  jobs: Record<string, UploadJob>;
  /** Files attached in each channel's composer but not sent yet. */
  drafts: Record<string, string[]>;
  /** Increases when an upload finishes or fails (not on progress), for cheap subscriptions. */
  settled: number;
  add: (channelId: string, files: File[]) => void;
  retry: (key: string) => void;
  remove: (key: string) => void;
  /** Hands the channel's draft uploads to a message being sent. */
  takeDraft: (channelId: string) => string[];
  reset: () => void;
}

const files = new Map<string, File>();
const handles = new Map<string, UploadHandle<unknown>>();
/** Server attachment id → local object URL, so the sender keeps seeing the local copy. */
const localByAttachment = new Map<string, string>();

const guessKind = (file: File): UploadKind =>
  uploadKindForMime(file.type) ?? (/\.(wav|mp3|ogg|flac|m4a|aac|mid|midi)$/i.test(file.name) ? 'audio' : 'document');

const newKey = () => `u${crypto.randomUUID().replace(/-/g, '')}`;

export const useUploads = create<UploadsState>((set, get) => {
  const patch = (key: string, p: Partial<UploadJob>) => {
    const job = get().jobs[key];
    if (!job) return;
    const settled = p.status && p.status !== 'uploading' ? get().settled + 1 : get().settled;
    set({ jobs: { ...get().jobs, [key]: { ...job, ...p } }, settled });
  };

  const run = async (key: string) => {
    const file = files.get(key);
    const job = get().jobs[key];
    if (!file || !job) return;
    patch(key, { status: 'uploading', progress: 0, error: undefined, permanent: undefined });
    try {
      let body = file;
      if (job.kind === 'image') {
        const prepared = await prepareImage(file);
        body = prepared.file;
        patch(key, { width: prepared.width, height: prepared.height });
      }
      if (!get().jobs[key]) return; // removed meanwhile
      const form = new FormData();
      form.append('file', body, file.name);
      const handle = uploadWithProgress<{ attachment: AttachmentDTO }>(
        `/api/channels/${job.channelId}/attachments`,
        form,
        (progress) => patch(key, { progress }),
        { 'X-Upload-Key': key },
      );
      handles.set(key, handle);
      // Audio: analyse in parallel with the upload instead of before it.
      const peaks = job.kind === 'audio' ? computePeaks(file) : Promise.resolve(null);
      let { attachment } = await handle.promise;
      const meta = await peaks;
      if (meta) {
        try {
          ({ attachment } = await api.put<{ attachment: AttachmentDTO }>(`/api/attachments/${attachment.id}/audio`, {
            waveform: meta.peaks,
            durationMs: meta.durationMs,
          }));
        } catch {
          /* the waveform is optional: the file itself was uploaded */
        }
      }
      if (job.localUrl) localByAttachment.set(attachment.id, job.localUrl);
      patch(key, { status: 'done', progress: 1, attachment });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'aborted') return;
      const permanent = err instanceof ApiError && [400, 413, 415].includes(err.status);
      patch(key, { status: 'error', error: errorMessage(err), permanent });
    } finally {
      handles.delete(key);
    }
  };

  return {
    jobs: {},
    drafts: {},
    settled: 0,

    add: (channelId, list) => {
      const jobs = { ...get().jobs };
      const keys: string[] = [];
      for (const file of list) {
        const key = newKey();
        const kind = guessKind(file);
        files.set(key, file);
        jobs[key] = {
          key,
          channelId,
          name: file.name,
          size: file.size,
          mime: file.type,
          kind,
          localUrl: kind === 'image' ? URL.createObjectURL(file) : null,
          width: null,
          height: null,
          status: 'uploading',
          progress: 0,
          attachment: null,
        };
        keys.push(key);
      }
      set({ jobs, drafts: { ...get().drafts, [channelId]: [...(get().drafts[channelId] ?? []), ...keys] } });
      for (const key of keys) void run(key);
    },

    retry: (key) => {
      const job = get().jobs[key];
      if (job?.status === 'error' && !job.permanent) void run(key);
    },

    remove: (key) => {
      handles.get(key)?.abort();
      handles.delete(key);
      const job = get().jobs[key];
      if (job?.localUrl && !(job.attachment && localByAttachment.has(job.attachment.id))) {
        URL.revokeObjectURL(job.localUrl);
      }
      files.delete(key);
      const jobs = { ...get().jobs };
      delete jobs[key];
      const drafts = { ...get().drafts };
      if (job) drafts[job.channelId] = (drafts[job.channelId] ?? []).filter((k) => k !== key);
      set({ jobs, drafts, settled: get().settled + 1 });
    },

    takeDraft: (channelId) => {
      const keys = get().drafts[channelId] ?? [];
      const drafts = { ...get().drafts };
      delete drafts[channelId];
      set({ drafts });
      return keys;
    },

    reset: () => {
      for (const h of handles.values()) h.abort();
      handles.clear();
      for (const job of Object.values(get().jobs)) if (job.localUrl) URL.revokeObjectURL(job.localUrl);
      files.clear();
      localByAttachment.clear();
      set({ jobs: {}, drafts: {}, settled: get().settled + 1 });
    },
  };
});

/** The local copy of a file this device uploaded (shown instead of downloading it again). */
export const localUrlFor = (attachmentId: string): string | null => localByAttachment.get(attachmentId) ?? null;

/** How an upload looks in a message before the server has it. */
export function displayAttachment(job: UploadJob): DisplayAttachment {
  if (job.attachment) return job.attachment;
  return {
    id: `local-${job.key}`,
    kind: job.kind,
    name: job.name,
    mime: job.mime,
    size: job.size,
    url: job.localUrl ?? '',
    previewUrl: null,
    width: job.width,
    height: job.height,
    durationMs: null,
    waveform: null,
    uploadKey: job.key,
  };
}
