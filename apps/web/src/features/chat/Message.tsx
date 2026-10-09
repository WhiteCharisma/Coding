import { Permission, type MessageDTO } from '@creator-network/shared';
import { Copy, CornerUpLeft, Flag, Link2, MoreHorizontal, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-react';
import { memo, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime, formatTime } from '../../lib/format';
import { formatMessage, stripFormatting } from '../../lib/markdown';
import { DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { Sheet } from '../../components/ui/dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { Textarea } from '../../components/ui/input';
import { toast } from '../../components/ui/toast';
import { Tooltip } from '../../components/ui/tooltip';
import { UserAvatar } from '../../components/user/UserAvatar';
import { ProfilePopover } from '../profile/ProfilePopover';
import { ReportDialog } from '../report/ReportDialog';
import { copyText, deleteMessage, editMessage, messageLink, setPinned, toggleReaction } from './actions';
import { Attachments } from './Attachments';
import { EmojiGrid, EmojiPicker } from './EmojiPicker';

export interface MessageContext {
  selfId: string;
  selfUsername: string;
  permissions: number;
  isDm: boolean;
  communityId: string | null;
  canSend: boolean;
  blockedIds: Set<string>;
  roleColor: (userId: string) => string | null;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onReply: (m: MessageDTO) => void;
  onJump: (messageId: string) => void;
  onMentionClick: (username: string) => void;
}

interface MessageProps {
  message: MessageDTO;
  compact: boolean;
  highlighted: boolean;
  ctx: MessageContext;
}

function ReplyPreview({ message, onJump }: { message: MessageDTO; onJump: (id: string) => void }) {
  const r = message.replyTo;
  if (!r) return null;
  const text = r.deleted
    ? t('chat.message.replyDeleted')
    : r.content
      ? stripFormatting(r.content)
      : r.attachmentCount
        ? t('chat.message.replyAttachment')
        : '';
  return (
    <button
      type="button"
      onClick={() => onJump(r.id)}
      aria-label={t('chat.message.jumpToReply')}
      className="group/reply mb-0.5 ml-[52px] flex max-w-full items-center gap-1.5 text-left text-xs text-fg-muted hover:text-fg-2"
    >
      <span
        aria-hidden
        className="-mb-2 ml-[-34px] h-3 w-7 shrink-0 rounded-tl-md border-t-2 border-l-2 border-line-strong"
      />
      {r.author && <UserAvatar name={r.author.displayName} src={r.author.avatarUrl} size="xs" />}
      <span className="shrink-0 font-semibold text-fg-2">
        {r.author?.displayName ?? t('common.labels.deletedUser')}
      </span>
      <span className={cn('truncate', r.deleted && 'italic')}>{text}</span>
    </button>
  );
}

function ReactionBar({ message, canReact }: { message: MessageDTO; canReact: boolean }) {
  if (message.reactions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {message.reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact && !r.me}
          onClick={() => void toggleReaction(message, r.emoji)}
          aria-pressed={r.me}
          aria-label={t('chat.actions.reactionCount', { count: r.count, emoji: r.emoji })}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-sm transition-[background-color,border-color,transform] duration-[var(--dur-fast)] active:scale-95',
            r.me
              ? 'border-accent-border bg-accent-soft text-accent-text'
              : 'border-line bg-elevated/60 text-fg-2 hover:border-line-strong',
          )}
        >
          <span className="text-base leading-none">{r.emoji}</span>
          <span className="font-mono text-xs font-semibold tabular-nums">{r.count}</span>
        </button>
      ))}
      {canReact && (
        <EmojiPicker onPick={(e) => void toggleReaction(message, e)}>
          <button
            type="button"
            aria-label={t('chat.actions.react')}
            className="grid h-7 w-8 place-items-center rounded-full border border-dashed border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <SmilePlus className="size-3.5" />
          </button>
        </EmojiPicker>
      )}
    </div>
  );
}

function InlineEditor({ message, onDone }: { message: MessageDTO; onDone: () => void }) {
  const [value, setValue] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const content = value.trim();
    if (!content || content === message.content) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      await editMessage(message, content);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
  };
  return (
    <div className="mt-1">
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        disabled={busy}
        className="min-h-16 bg-inset text-base"
        aria-label={t('chat.composer.editing')}
      />
      <p className="mt-1 text-xs text-fg-muted">{t('chat.composer.editHint')}</p>
    </div>
  );
}

export const Message = memo(function Message({ message, compact, highlighted, ctx }: MessageProps) {
  const editing = ctx.editingId === message.id;
  const setEditing = (on: boolean) => ctx.setEditingId(on ? message.id : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [revealBlocked, setRevealBlocked] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const author = message.author;
  const own = author?.id === ctx.selfId;
  const canManage =
    (ctx.permissions & Permission.MANAGE_MESSAGES) !== 0 || (ctx.permissions & Permission.ADMINISTRATOR) !== 0;
  const canReact = (ctx.permissions & Permission.ADD_REACTIONS) !== 0;
  const canPin = canManage || ctx.isDm;
  const mentionsMe = message.mentionEveryone || message.mentions.some((m) => m.id === ctx.selfId);
  const blocked = !!author && ctx.blockedIds.has(author.id) && !revealBlocked;
  const formatted = useMemo(
    () =>
      formatMessage(message.content, {
        mentions: new Set(message.mentions.map((m) => m.username)),
        selfUsername: ctx.selfUsername,
        onMentionClick: ctx.onMentionClick,
      }),
    [message.content, message.mentions, ctx.selfUsername, ctx.onMentionClick],
  );

  if (message.deletedAt) return null;

  const nameColor = author ? ctx.roleColor(author.id) : null;
  const actions: { key: string; label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }[] = [];
  if (ctx.canSend)
    actions.push({
      key: 'reply',
      label: t('chat.actions.reply'),
      icon: <CornerUpLeft />,
      onSelect: () => ctx.onReply(message),
    });
  if (own)
    actions.push({ key: 'edit', label: t('chat.actions.edit'), icon: <Pencil />, onSelect: () => setEditing(true) });
  if (canPin)
    actions.push({
      key: 'pin',
      label: message.pinnedAt ? t('chat.actions.unpin') : t('chat.actions.pin'),
      icon: message.pinnedAt ? <PinOff /> : <Pin />,
      onSelect: () => void setPinned(message, !message.pinnedAt),
    });
  if (message.content)
    actions.push({
      key: 'copy',
      label: t('chat.actions.copyText'),
      icon: <Copy />,
      onSelect: () => void copyText(message.content),
    });
  actions.push({
    key: 'link',
    label: t('chat.actions.copyLink'),
    icon: <Link2 />,
    onSelect: () => void copyText(messageLink(message, ctx.communityId)),
  });
  if (!own)
    actions.push({
      key: 'report',
      label: t('chat.actions.report'),
      icon: <Flag />,
      onSelect: () => setReportOpen(true),
    });
  if (own || canManage)
    actions.push({
      key: 'delete',
      label: t('chat.actions.delete'),
      icon: <Trash2 />,
      onSelect: () => setConfirmDelete(true),
      danger: true,
    });

  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    pressTimer.current = window.setTimeout(() => setSheetOpen(true), 480);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const timestamp = (
    <Tooltip content={formatDateTime(message.createdAt)}>
      <time
        dateTime={new Date(message.createdAt).toISOString()}
        className="font-mono text-[11px] text-fg-muted tabular-nums"
      >
        {formatTime(message.createdAt)}
      </time>
    </Tooltip>
  );

  return (
    <div
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={cn(
        'group relative px-4 transition-colors duration-[var(--dur-fast)] hover:bg-hover/70',
        compact ? 'py-0.5 compact:py-0' : 'mt-3 pt-1 pb-0.5 compact:mt-1.5',
        mentionsMe &&
          'bg-mention before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-mention-bar hover:bg-mention',
        highlighted && 'animate-highlight',
      )}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        if (window.matchMedia('(hover: none)').matches) e.preventDefault();
      }}
    >
      {!compact && <ReplyPreview message={message} onJump={ctx.onJump} />}
      <div className="flex gap-3">
        <div className="w-10 shrink-0">
          {compact ? (
            <span className="block pt-1 text-right opacity-0 transition-opacity group-hover:opacity-100">
              {timestamp}
            </span>
          ) : author ? (
            <ProfilePopover username={author.username} disabled={author.deleted}>
              <button
                type="button"
                className="mt-0.5 rounded-full transition-transform active:scale-95"
                aria-label={author.displayName}
              >
                <UserAvatar name={author.displayName} src={author.avatarUrl} size="lg" />
              </button>
            </ProfilePopover>
          ) : (
            <UserAvatar name="?" src={null} size="lg" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!compact && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {author ? (
                <ProfilePopover username={author.username} disabled={author.deleted}>
                  <button
                    type="button"
                    className="font-semibold text-fg hover:underline"
                    style={nameColor ? { color: nameColor } : undefined}
                  >
                    {author.displayName}
                  </button>
                </ProfilePopover>
              ) : (
                <span className="font-semibold text-fg-muted">{t('common.labels.deletedUser')}</span>
              )}
              {author?.isDemo && <DemoBadge />}
              {timestamp}
              {message.pinnedAt && (
                <span className="inline-flex items-center gap-1 text-2xs font-medium text-accent-text">
                  <Pin className="size-3" /> {t('chat.message.pinnedBadge')}
                </span>
              )}
            </div>
          )}
          {blocked ? (
            <p className="text-sm text-fg-muted italic">
              {t('chat.message.blockedHidden')}{' '}
              <button
                type="button"
                className="font-medium text-accent-text not-italic hover:underline"
                onClick={() => setRevealBlocked(true)}
              >
                {t('chat.message.show')}
              </button>
            </p>
          ) : editing ? (
            <InlineEditor message={message} onDone={() => setEditing(false)} />
          ) : (
            <>
              {message.content && (
                <div
                  className="text-base break-words whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]"
                  data-testid="message-content"
                >
                  {formatted}
                  {message.editedAt && (
                    <Tooltip content={formatDateTime(message.editedAt)}>
                      <span className="ml-1.5 text-[11px] text-fg-faint select-none">{t('chat.message.edited')}</span>
                    </Tooltip>
                  )}
                </div>
              )}
              {message.attachments.length > 0 && <Attachments items={message.attachments} />}
              <ReactionBar message={message} canReact={canReact} />
            </>
          )}
        </div>
      </div>

      {!editing && !blocked && (
        <div
          role="toolbar"
          aria-label={t('chat.actions.menu')}
          className="absolute -top-4 right-4 z-[var(--z-sticky)] hidden items-center rounded-lg border border-line bg-overlay p-0.5 opacity-0 shadow-md transition-opacity duration-[var(--dur-fast)] group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:flex"
        >
          {canReact && (
            <EmojiPicker onPick={(e) => void toggleReaction(message, e)}>
              <Button variant="ghost" size="icon-xs" aria-label={t('chat.actions.react')}>
                <SmilePlus />
              </Button>
            </EmojiPicker>
          )}
          {ctx.canSend && (
            <Tooltip content={t('chat.actions.reply')}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('chat.actions.reply')}
                onClick={() => ctx.onReply(message)}
              >
                <CornerUpLeft />
              </Button>
            </Tooltip>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t('chat.actions.menu')}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {actions.map((a, i) => (
                <div key={a.key}>
                  {a.danger && i > 0 && <MenuSeparator />}
                  <MenuItem danger={a.danger} onSelect={a.onSelect}>
                    {a.icon} {a.label}
                  </MenuItem>
                </div>
              ))}
            </MenuContent>
          </Menu>
        </div>
      )}

      {/* Touch devices: long-press opens an action sheet (no hover needed). */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} side="bottom" title={t('chat.actions.menu')}>
        <div className="safe-bottom flex flex-col gap-3 p-4">
          {canReact && (
            <EmojiGrid
              onPick={(e) => {
                setSheetOpen(false);
                void toggleReaction(message, e);
              }}
            />
          )}
          <div className="flex flex-col">
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  a.onSelect();
                }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-left text-base [&_svg]:size-5',
                  a.danger ? 'text-danger' : 'text-fg-2 active:bg-active',
                )}
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('chat.actions.deleteTitle')}
        body={t('chat.actions.deleteBody')}
        confirmLabel={t('common.actions.delete')}
        danger
        onConfirm={() => deleteMessage(message)}
      />
      {reportOpen && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          target={{ type: 'message', id: message.id, label: t('report.message') }}
        />
      )}
    </div>
  );
});
