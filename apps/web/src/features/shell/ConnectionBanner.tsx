import { CloudOff, RefreshCw } from 'lucide-react';
import { t } from '../../i18n';
import { useChat } from '../../stores/chat';
import { useDelayedFlag } from './hooks';

/** Shows connection problems after a short grace period (no flicker on brief blips). */
export function ConnectionBanner() {
  const connection = useChat((s) => s.connection);
  const visible = useDelayedFlag(connection === 'reconnecting' || connection === 'offline', 1500);
  if (!visible) return null;
  const offline = connection === 'offline';
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2 text-sm text-fg animate-fade-in"
    >
      {offline ? (
        <CloudOff className="size-4 text-warning" />
      ) : (
        <RefreshCw className="size-4 animate-spin text-warning" />
      )}
      <span>{offline ? t('shell.connection.offline') : t('shell.connection.reconnecting')}</span>
    </div>
  );
}
