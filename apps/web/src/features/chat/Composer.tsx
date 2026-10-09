import { LIMITS, type MessageReplyDTO, type UserSummary } from '@creator-network/shared';
import { FileAudio, FileText, Film, Lock, Paperclip, RotateCcw, SendHorizontal, Smile, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { emitTyping } from '../../lib/realtime';
import { stripFormatting } from '../../lib/markdown';
import { useMessages } from '../../stores/messages';
import { useSession } from '../../stores/session';
import { useUploads, type UploadJob } from '../../stores/uploads';
import { Button } from '../../components/ui/button';
import { toast } from '../../components/ui/toast';
import { Tooltip } from '../../components/ui/tooltip';
import { UserAvatar } from '../../components/user/UserAvatar';
import { EmojiPicker } from './EmojiPicker';

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
const NO_KEYS: string[] = [];

function UploadChip({ job }: { job: UploadJob }) {
  const Icon = job.kind === 'audio' ? FileAudio : job.kind === 'video' ? Film : FileText;
  const failed = job.status === 'error';
  return (
    <li
      className={cn(
        'relative flex w-52 items-center gap-2 overflow-hidden rounded-xl border bg-inset px-2 py-1.5 shadow-[inset_0_1px_0_var(--glass-sheen)]',
        failed ? 'border-danger/50' : 'border-glass-edge',
      )}
      data-testid="upload-chip"
      data-status={job.status}
    >
      {job.localUrl ? (
        <img src={job.localUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" draggable={false} />
      ) : (
        <Icon className={cn('mx-2 size-4 shrink-0', failed ? 'text-danger' : 'text-accent-text')} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-fg">{job.name}</span>
        <span className={cn('block truncate text-[11px]', failed ? 'text-danger' : 'text-fg-muted')}>
          {failed
            ? (job.error ?? t('chat.composer.uploadFailed'))
            : job.status === 'done'
              ? formatBytes(job.size)
              : `${t('chat.composer.uploading')} ${Math.round(job.progress * 100)}%`}
        </span>
      </span>
      {failed && !job.permanent && (
        <button
          type="button"
          aria-label={t('common.actions.retry')}
          onClick={() => useUploads.getState().retry(job.key)}
          className="rounded p-0.5 text-fg-muted hover:text-fg"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={t('chat.composer.removeAttachment', { name: job.name })}
        onClick={() => useUploads.getState().remove(job.key)}
        className="rounded p-0.5 text-fg-muted hover:text-fg"
      >
        <X className="size-3.5" />
      </button>
      {job.status === 'uploading' && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition-transform duration-200"
          style={{ transform: `scaleX(${Math.max(0.04, job.progress)})` }}
        />
      )}
    </li>
  );
}

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
  // Files attached here live in the uploads store: they keep uploading if you switch channels.
  const draftKeys = useUploads((s) => s.drafts[channelId] ?? NO_KEYS);
  const uploads = useUploads(useShallow((s) => draftKeys.flatMap((k) => (s.jobs[k] ? [s.jobs[k]] : []))));
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

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

  const overLimit = value.length - LIMITS.messageMax;
  // Sending while files upload is fine: the message waits for them, the conversation does not.
  const canSubmit =
    canSend &&
    overLimit <= 0 &&
    !uploads.some((u) => u.status === 'error') &&
    (value.trim().length > 0 || uploads.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    useMessages.getState().send(channelId, {
      content: value.trim(),
      replyTo,
      attachments: [],
      uploadKeys: useUploads.getState().takeDraft(channelId),
    });
    setValue('');
    saveDraft(channelId, '');
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

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const maxMb = config?.maxUploadMb ?? 25;
    const room = LIMITS.attachmentsPerMessage - uploads.length;
    if (list.length > room) {
      // Keep the first ones that fit; tell the user about the limit.
      list.length = Math.max(0, room);
      toast.error(t('chat.composer.maxAttachments', { max: LIMITS.attachmentsPerMessage }));
    }
    const accepted = list.filter((file) => {
      if (file.size <= maxMb * 1024 * 1024) return true;
      toast.error(t('chat.composer.fileTooLarge', { name: file.name, max: maxMb }));
      return false;
    });
    if (accepted.length) useUploads.getState().add(channelId, accepted);
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
          className="glass absolute inset-x-4 bottom-full z-[var(--z-popover)] mb-1 overflow-hidden rounded-xl bg-overlay p-1 animate-pop-in"
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
      <div className="glass rounded-2xl bg-elevated transition-[border-color,box-shadow] duration-[var(--dur-fast)] focus-within:border-accent-border focus-within:shadow-[inset_0_1px_0_var(--glass-sheen),0_0_0_3px_var(--accent-soft),0_8px_24px_-10px_var(--accent-glow)]">
        {replyTo && (
          <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-xs text-fg-muted">
            <span className="min-w-0 flex-1 truncate">
              {t('chat.composer.replyingTo', { name: replyTo.author?.displayName ?? t('common.labels.deletedUser') })}
              <span className="ml-2 text-fg-muted">{stripFormatting(replyTo.content).slice(0, 80)}</span>
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
            {uploads.map((job) => (
              <UploadChip key={job.key} job={job} />
            ))}
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
                  className="rounded-full"
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
            className="max-h-[40vh] min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-base text-fg placeholder:text-fg-muted focus:outline-none"
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
              <Button variant="ghost" size="icon" className="rounded-full" aria-label={t('chat.composer.emoji')}>
                <Smile className="size-[18px]" />
              </Button>
            </EmojiPicker>
          </div>
          <Button
            variant={canSubmit ? 'primary' : 'ghost'}
            size="icon"
            className="rounded-full"
            aria-label={t('chat.composer.send')}
            onClick={submit}
            disabled={!canSubmit}
            data-testid="composer-send"
          >
            <SendHorizontal className="size-[18px]" />
          </Button>
        </div>
      </div>
      <div className="mt-1 hidden h-4 items-center justify-between px-1 text-[11px] text-fg-muted md:flex">
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
