import { queryClient } from '../lib/queryClient';
import { stopRealtime } from '../lib/realtime';
import { useChat } from '../stores/chat';
import { useMessages } from '../stores/messages';
import { useUploads } from '../stores/uploads';

/**
 * Clears everything a signed-in session loaded (loaded on demand after sign-out).
 * Unsent messages stay on the device when the session ended on its own (expired or revoked
 * elsewhere), so they can be sent after signing in again; an explicit sign-out deletes them.
 */
export function teardownSession({ discardUnsent }: { discardUnsent: boolean }): void {
  stopRealtime();
  useChat.getState().reset();
  if (discardUnsent) useMessages.getState().discardOutbox();
  useUploads.getState().reset();
  useMessages.getState().reset();
  useMessages.getState().setUser(null);
  queryClient.clear();
}
