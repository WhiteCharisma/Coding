import { queryClient } from '../lib/queryClient';
import { stopRealtime } from '../lib/realtime';
import { useChat } from '../stores/chat';
import { useMessages } from '../stores/messages';

/** Clears everything a signed-in session loaded (loaded on demand after sign-out). */
export function teardownSession(): void {
  stopRealtime();
  useChat.getState().reset();
  useMessages.getState().reset();
  useMessages.getState().setUser(null);
  queryClient.clear();
}
