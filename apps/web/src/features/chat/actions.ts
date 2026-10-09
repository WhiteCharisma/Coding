import type { MessageDTO, ReactionEvent } from '@creator-network/shared';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { playSound } from '../../lib/sounds';
import { useMessages } from '../../stores/messages';
import { useSession } from '../../stores/session';
import { toast } from '../../components/ui/toast';

/** Toggles a reaction optimistically; the server broadcast then sets the exact count. */
export async function toggleReaction(message: MessageDTO, emoji: string): Promise<void> {
  const me = useSession.getState().user;
  if (!me) return;
  const existing = message.reactions.find((r) => r.emoji === emoji);
  const add = !existing?.me;
  const optimistic: ReactionEvent = {
    messageId: message.id,
    channelId: message.channelId,
    emoji,
    userId: me.id,
    added: add,
    count: (existing?.count ?? 0) + (add ? 1 : -1),
  };
  useMessages.getState().reaction(optimistic, me.id);
  if (add) playSound('reaction');
  try {
    const ev = add
      ? await api.put<ReactionEvent>(`/api/messages/${message.id}/reactions`, { emoji })
      : await api.del<ReactionEvent>(`/api/messages/${message.id}/reactions?emoji=${encodeURIComponent(emoji)}`);
    if (ev) useMessages.getState().reaction(ev, me.id);
  } catch (err) {
    useMessages.getState().reaction({ ...optimistic, added: !add, count: existing?.count ?? 0 }, me.id);
    toast.error(errorMessage(err));
  }
}

export async function setPinned(message: MessageDTO, pinned: boolean): Promise<void> {
  try {
    const res = pinned
      ? await api.put<{ message: MessageDTO }>(`/api/messages/${message.id}/pin`)
      : await api.del<{ message: MessageDTO }>(`/api/messages/${message.id}/pin`);
    useMessages.getState().update(res.message);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export async function deleteMessage(message: MessageDTO): Promise<void> {
  await api.del(`/api/messages/${message.id}`);
  useMessages.getState().remove(message.channelId, message.id);
}

export async function editMessage(message: MessageDTO, content: string): Promise<void> {
  const res = await api.patch<{ message: MessageDTO }>(`/api/messages/${message.id}`, { content });
  useMessages.getState().update(res.message);
}

export function messageLink(message: MessageDTO, communityId: string | null): string {
  const path = communityId ? `/c/${communityId}/${message.channelId}` : `/dm/${message.channelId}`;
  return `${window.location.origin}${path}?m=${message.id}`;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t('common.actions.copied'));
  } catch {
    toast.error(t('common.errors.generic'));
  }
}
