import { LIMITS, type AttachmentDTO, type MessageReplyDTO, type UserSummary } from '@creator-network/shared';
import { FileAudio, FileImage, FileText, Lock, Paperclip, RotateCcw, SendHorizontal, Smile, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { t } from '../../i18n';
import { errorMessage, uploadWithProgress } from '../../lib/api';
import { computePeaks } from '../../lib/audio';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { shrinkLargeImage } from '../../lib/image';
import { emitTyping } from '../../lib/realtime';
import { stripFormatting } from '../../lib/markdown';
import { useMessages } from '../../stores/messages';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { toast } from '../../components/ui/toast';
import { Tooltip } from '../../components/ui/tooltip';
import { UserAvatar } from '../../components/user/UserAvatar';
import { EmojiPicker } from './EmojiPicker';

interface UploadItem {
  key: string;
  file: File;
  status: 'preparing' | 'uploading' | 'done' | 'error';
  progress: number;
  attachment?: AttachmentDTO;
  error?: string;
  abort?: () => void;
}

export interface ComposerProps {
  channelId: string;
  placeholder: string;
  canSend: boolean;
  canAttach: boolean;
  disabledReason?: string;
  replyTo: MessageReplyDTO | null;
  onCancelReply: () => void;
  onEditLast: () => void;
  mentionCandidates: UserSummary[];
}

const draftKey = (channelId: string) => `cn.draft.${channelId}`;
function loadDraft(channelId: string): string {
  try {
    return sessionStorage.getItem(draftKey(channelId)) ?? '';
  } catch {
    return '';
  }
}
function saveDraft(channelId: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(draftKey(channelId), value);
    else sessionStorage.removeItem(draftKey(channelId));
  } catch {
    /* ignore */
  }
}

const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

export function Composer({
  channelId,
  placeholder,
  canSend,
  canAttach,
  disabledReason,
  replyTo,
  onCancelReply,
  onEditLast,
  mentionCandidates,
}: ComposerProps) {
  const config = useSession((s) => s.config);
  const [value, setValue] = useState(() => loadDraft(channelId));
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  // The composer is remounted per channel (ChannelView is keyed by channel id); abort unfinished uploads on unmount.
  const uploadsRef = useRef(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);
  useEffect(() => () => uploadsRef.current.forEach((u) => u.abort?.()), []);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Auto-size the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [value]);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return mentionCandidates
      .filter((u) => !u.deleted && (u.username.startsWith(q) || u.displayName.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [mention, mentionCandidates]);

  const updateMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|[\s(])@([a-z0-9._-]{0,32})$/i.exec(before);
    if (m) {
      setMention({ query: m[2] ?? '', start: caret - (m[2]?.length ?? 0) - 1 });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  };

  const insertMention = (u: UserSummary) => {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}@${u.username} ${value.slice(caret)}`;
    setValue(next);
    saveDraft(channelId, next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + u.username.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    saveDraft(channelId, next);
    updateMention(next, e.target.selectionStart);
    const now = Date.now();
    if (next.trim() && now - lastTyping.current > 2500) {
      lastTyping.current = now;
      emitTyping(channelId, true);
    } else if (!next.trim() && lastTyping.current) {
      lastTyping.current = 0;
      emitTyping(channelId, false);
    }
  };

  const uploading = uploads.some((u) => u.status === 'preparing' || u.status === 'uploading');
  const ready = uploads.filter((u) => u.status === 'done' && u.attachment);
  const overLimit = value.length - LIMITS.messageMax;
  const canSubmit = canSend && !uploading && overLimit <= 0 && (value.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    useMessages.getState().send(channelId, {
      content: value.trim(),
      replyTo,
      attachments: ready.map((u) => u.attachment as AttachmentDTO),
    });
    setValue('');
    saveDraft(channelId, '');
    setUploads([]);
    onCancelReply();
    if (lastTyping.current) emitTyping(channelId, false);
    lastTyping.current = 0;
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const u = matches[mentionIndex];
        if (u) insertMention(u);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !coarsePointer()) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && replyTo) {
      e.preventDefault();
      onCancelReply();
    } else if (e.key === 'ArrowUp' && !value) {
      e.preventDefault();
      onEditLast();
    }
  };

  const startUpload = useCallback(
    async (item: UploadItem) => {
      const setItem = (patch: Partial<UploadItem>) =>
        setUploads((list) => list.map((u) => (u.key === item.key ? { ...u, ...patch } : u)));
      setItem({ status: 'preparing', progress: 0, error: undefined });
      let file = item.file;
      const form = new FormData();
      if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(file.name)) {
        const meta = await computePeaks(file);
        if (meta) {
          form.append('waveform', JSON.stringify(meta.peaks));
          form.append('durationMs', String(meta.durationMs));
        }
      } else if (file.type.startsWith('image/')) {
        file = await shrinkLargeImage(file);
      }
      form.append('file', file, file.name);
      const handle = uploadWithProgress<{ attachment: AttachmentDTO }>(
        `/api/channels/${channelId}/attachments`,
        form,
        (p) => setItem({ progress: p }),
      );
      setItem({ status: 'uploading', abort: handle.abort });
      try {
        const res = await handle.promise;
        setItem({ status: 'done', progress: 1, attachment: res.attachment, abort: undefined });
      } catch (err) {
        setItem({ status: 'error', error: errorMessage(err), abort: undefined });
      }
    },
    [channelId],
  );

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const maxMb = config?.maxUploadMb ?? 25;
    const room = LIMITS.attachmentsPerMessage - uploads.length;
    if (list.length > room) {
      // Keep the first ones that fit; tell the user about the limit.
      list.length = Math.max(0, room);
      toast.error(t('chat.composer.maxAttachments', { max: LIMITS.attachmentsPerMessage }));
    }
    const items: UploadItem[] = [];
    for (const file of list) {
      if (file.size > maxMb * 1024 * 1024) {
        items.push({
          key: crypto.randomUUID(),
          file,
          status: 'error',
          progress: 0,
          error: t('chat.composer.fileTooLarge', { name: file.name, max: maxMb }),
        });
        continue;
      }
      items.push({ key: crypto.randomUUID(), file, status: 'preparing', progress: 0 });
    }
    setUploads((u) => [...u, ...items]);
    for (const it of items) if (it.status === 'preparing') void startUpload(it);
  };

  const removeUpload = (key: string) => {
    setUploads((list) => {
      list.find((u) => u.key === key)?.abort?.();
      return list.filter((u) => u.key !== key);
    });
  };

  if (!canSend) {
    return (
      <div className="px-4 pt-1 pb-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-line-subtle bg-inset px-4 py-3 text-sm text-fg-muted">
          <Lock className="size-4" /> {disabledReason ?? t('chat.composer.placeholderReadOnly')}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative px-3 pt-1 pb-[max(env(safe-area-inset-bottom),12px)] md:px-4 md:pb-4"
      onDragOver={(e) => {
        if (canAttach && e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!canAttach || !e.dataTransfer.files.length) return;
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }}
    >
      {mention && matches.length > 0 && (
        <div
          role="listbox"
          aria-label={t('chat.composer.mentionSuggestions')}
          className="absolute inset-x-4 bottom-full z-[var(--z-popover)] mb-1 overflow-hidden rounded-xl border border-line bg-overlay p-1 shadow-lg animate-pop-in"
        >
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === mentionIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(u);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
                i === mentionIndex ? 'bg-active' : 'hover:bg-hover',
              )}
            >
              <UserAvatar name={u.displayName} src={u.avatarUrl} size="sm" />
              <span className="text-ui font-medium text-fg">{u.displayName}</span>
              <span className="text-xs text-fg-muted">@{u.username}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-line bg-elevated shadow-sm transition-[border-color,box-shadow] duration-[var(--dur-fast)] focus-within:border-accent-border focus-within:ring-3 focus-within:ring-accent-soft">
        {replyTo && (
          <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-xs text-fg-muted">
            <span className="min-w-0 flex-1 truncate">
              {t('chat.composer.replyingTo', { name: replyTo.author?.displayName ?? t('common.labels.deletedUser') })}
              <span className="ml-2 text-fg-faint">{stripFormatting(replyTo.content).slice(0, 80)}</span>
            </span>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label={t('chat.composer.cancelReply')}
              className="rounded p-0.5 hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {uploads.length > 0 && (
          <ul className="flex flex-wrap gap-2 border-b border-line-subtle p-2.5">
            {uploads.map((u) => {
              const Icon = u.file.type.startsWith('image/')
                ? FileImage
                : u.file.type.startsWith('audio/')
                  ? FileAudio
                  : FileText;
              return (
                <li
                  key={u.key}
                  className={cn(
                    'relative flex w-52 items-center gap-2 overflow-hidden rounded-lg border bg-inset px-2.5 py-2',
                    u.status === 'error' ? 'border-danger/50' : 'border-line',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', u.status === 'error' ? 'text-danger' : 'text-accent-text')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-fg">{u.file.name}</span>
                    <span
                      className={cn(
                        'block truncate text-[11px]',
                        u.status === 'error' ? 'text-danger' : 'text-fg-muted',
                      )}
                    >
                      {u.status === 'error'
                        ? (u.error ?? t('chat.composer.uploadFailed'))
                        : u.status === 'done'
                          ? formatBytes(u.file.size)
                          : `${t('chat.composer.uploading')} ${Math.round(u.progress * 100)}%`}
                    </span>
                  </span>
                  {u.status === 'error' &&
                    u.error !==
                      t('chat.composer.fileTooLarge', { name: u.file.name, max: config?.maxUploadMb ?? 25 }) && (
                      <button
                        type="button"
                        aria-label={t('common.actions.retry')}
                        onClick={() => void startUpload(u)}
                        className="rounded p-0.5 text-fg-muted hover:text-fg"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  <button
                    type="button"
                    aria-label={t('chat.composer.removeAttachment', { name: u.file.name })}
                    onClick={() => removeUpload(u.key)}
                    className="rounded p-0.5 text-fg-muted hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                  {(u.status === 'uploading' || u.status === 'preparing') && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition-transform duration-200"
                      style={{ transform: `scaleX(${Math.max(0.04, u.progress)})` }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-end gap-1 p-1.5">
          {canAttach && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
                accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm,application/pdf,application/zip,text/plain,.mid,.midi,.txt,.md"
              />
              <Tooltip content={t('chat.composer.attach')}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('chat.composer.attach')}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploads.length >= LIMITS.attachmentsPerMessage}
                >
                  <Paperclip className="size-[18px]" />
                </Button>
              </Tooltip>
            </>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              if (canAttach && e.clipboardData.files.length > 0) {
                e.preventDefault();
                addFiles(e.clipboardData.files);
              }
            }}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            placeholder={placeholder}
            aria-label={placeholder}
            rows={1}
            maxLength={LIMITS.messageMax + 500}
            className="max-h-[40vh] min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-base text-fg placeholder:text-fg-faint focus:outline-none"
            data-testid="composer-input"
          />
          <div className="hidden md:block">
            <EmojiPicker
              onPick={(emoji) => {
                const el = textareaRef.current;
                const pos = el?.selectionStart ?? value.length;
                const next = value.slice(0, pos) + emoji + value.slice(pos);
                setValue(next);
                saveDraft(channelId, next);
                requestAnimationFrame(() => el?.focus());
              }}
            >
              <Button variant="ghost" size="icon" aria-label={t('chat.composer.emoji')}>
                <Smile className="size-[18px]" />
              </Button>
            </EmojiPicker>
          </div>
          <Button
            variant={canSubmit ? 'primary' : 'ghost'}
            size="icon"
            aria-label={t('chat.composer.send')}
            onClick={submit}
            disabled={!canSubmit}
            data-testid="composer-send"
          >
            <SendHorizontal className="size-[18px]" />
          </Button>
        </div>
      </div>
      <div className="mt-1 hidden h-4 items-center justify-between px-1 text-[11px] text-fg-faint md:flex">
        <span>{t('chat.composer.hintDesktop')}</span>
        {overLimit > -200 && (
          <span className={cn('font-mono', overLimit > 0 ? 'text-danger' : 'text-fg-muted')}>
            {overLimit > 0 ? t('chat.composer.tooLong', { count: overLimit }) : `${value.length}/${LIMITS.messageMax}`}
          </span>
        )}
      </div>
    </div>
  );
}
