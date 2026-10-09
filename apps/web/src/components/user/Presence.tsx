import type { PresenceStatus } from '@creator-network/shared';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';

/**
 * Presence indicator. Each status has a distinct SHAPE as well as a colour
 * (filled dot, crescent, bar, hollow ring) so it never relies on colour alone.
 */
export function PresenceIcon({ status, className }: { status: PresenceStatus; className?: string }) {
  const label = t(`common.presence.${status}`);
  return (
    <svg viewBox="0 0 12 12" className={cn('size-3', className)} role="img" aria-label={label}>
      <title>{label}</title>
      {status === 'online' && <circle cx="6" cy="6" r="5" fill="var(--presence-online)" />}
      {status === 'idle' && <path d="M6 1a5 5 0 1 0 5 5 3.9 3.9 0 0 1-5-5z" fill="var(--presence-idle)" />}
      {status === 'dnd' && (
        <>
          <circle cx="6" cy="6" r="5" fill="var(--presence-dnd)" />
          <rect x="3" y="5" width="6" height="2" rx="1" fill="var(--bg-sidebar)" />
        </>
      )}
      {status === 'offline' && <circle cx="6" cy="6" r="3.6" fill="none" stroke="var(--presence-offline)" strokeWidth="2.4" />}
    </svg>
  );
}
