import { Permission, type MessageDTO, type MessageReplyDTO, type UserSummary } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { playSound } from '../../lib/sounds';
import { VoiceRoomStrip } from '../voice/VoiceRoom';
import { markRead } from '../../lib/realtime';
import { stripFormatting } from '../../lib/markdown';
import { useChat } from '../../stores/chat';
import { EMPTY_CHANNEL, useMessages } from '../../stores/messages';
import { useSession } from '../../stores/session';
import { useUi } from '../../stores/ui';
import { PaneFoot } from '../../components/ui/glass-pane';
import { Composer } from './Composer';
import type { MessageContext } from './Message';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';

export interface ChannelViewProps {
  channelId: string;
  communityId: string | null;
  isDm: boolean;
  permissions: number;
  placeholder: string;
  disabledReason?: string;
  beginning: ReactNode;
  mentionCandidates: UserSummary[];
  roleColor?: (userId: string) => string | null;
}

const noColor = () => null;

export function ChannelView({
  channelId,
  communityId,
  isDm,
  permissions,
  placeholder,
  disabledReason,
  beginning,
  mentionCandidates,
  roleColor = noColor,
}: ChannelViewProps) {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [replyTo, setReplyTo] = useState<MessageReplyDTO | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const status = useMessages((s) => (s.byChannel[channelId] ?? EMPTY_CHANNEL).status);
  const lastMessage = useMessages((s) => {
    const list = (s.byChannel[channelId] ?? EMPTY_CHANNEL).messages;
    return list[list.length - 1];
  });
  const hasMoreAfter = useMessages((s) => (s.byChannel[channelId] ?? EMPTY_CHANNEL).hasMoreAfter);
  const atBottom = useUi((s) => s.atBottom);
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ users: UserSummary[] }>('/api/me/blocks'),
    staleTime: 60_000,
  });
  const blockedIds = useMemo(() => new Set((blocks.data?.users ?? []).map((u) => u.id)), [blocks.data]);

  const canSend = (permissions & Permission.SEND_MESSAGES) !== 0 || (permissions & Permission.ADMINISTRATOR) !== 0;
  const canAttach =
    canSend && ((permissions & Permission.ATTACH_FILES) !== 0 || (permissions & Permission.ADMINISTRATOR) !== 0);

  // Mark this channel active and load its history.
  useEffect(() => {
    useChat.getState().setActiveChannel(channelId);
    useUi.getState().setAtBottom(true);
    playSound('open');
    const jump = params.get('m');
    if (jump) {
      void useMessages.getState().jumpTo(channelId, jump);
      params.delete('m');
      setParams(params, { replace: true });
    } else {
      void useMessages.getState().ensureLoaded(channelId);
    }
    return () => {
      if (useChat.getState().activeChannelId === channelId) useChat.getState().setActiveChannel(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Acknowledge reading when the newest message is on screen.
  useEffect(() => {
    if (status !== 'ready' || !atBottom || hasMoreAfter || !lastMessage) return;
    if (document.visibilityState !== 'visible') return;
    markRead(channelId, lastMessage.id);
  }, [status, atBottom, hasMoreAfter, lastMessage, channelId]);

  useEffect(() => {
    const onVisible = () => {
      const s = useMessages.getState().byChannel[channelId];
      const last = s?.messages[s.messages.length - 1];
      if (document.visibilityState === 'visible' && last && useUi.getState().atBottom && !s?.hasMoreAfter)
        markRead(channelId, last.id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [channelId]);

  const onReply = useCallback((m: MessageDTO) => {
    setEditingId(null);
    setReplyTo({
      id: m.id,
      author: m.author,
      content: stripFormatting(m.content).slice(0, 200),
      deleted: false,
      attachmentCount: m.attachments.length,
    });
  }, []);
  const onJump = useCallback(
    (messageId: string) => void useMessages.getState().jumpTo(channelId, messageId),
    [channelId],
  );
  const onMentionClick = useCallback((username: string) => void navigate(`/u/${username}`), [navigate]);
  const onEditLast = useCallback(() => {
    if (!user) return;
    const list = useMessages.getState().byChannel[channelId]?.messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m && m.author?.id === user.id && !m.deletedAt && m.kind === 'default') {
        setEditingId(m.id);
        return;
      }
    }
  }, [channelId, user]);

  const ctx: MessageContext = useMemo(
    () => ({
      selfId: user?.id ?? '',
      selfUsername: user?.username ?? '',
      permissions,
      isDm,
      communityId,
      canSend,
      blockedIds,
      roleColor,
      editingId,
      setEditingId,
      onReply,
      onJump,
      onMentionClick,
    }),
    [
      user?.id,
      user?.username,
      permissions,
      isDm,
      communityId,
      canSend,
      blockedIds,
      roleColor,
      editingId,
      onReply,
      onJump,
      onMentionClick,
    ],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <VoiceRoomStrip channelId={channelId} />
      <MessageList channelId={channelId} ctx={ctx} beginning={beginning} />
      <PaneFoot>
        <TypingIndicator channelId={channelId} />
        <Composer
          channelId={channelId}
          placeholder={placeholder}
          canSend={canSend}
          canAttach={canAttach}
          disabledReason={disabledReason}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onEditLast={onEditLast}
          mentionCandidates={mentionCandidates}
        />
      </PaneFoot>
    </div>
  );
}
