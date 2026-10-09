import type { NotificationDTO } from '@creator-network/shared';
import { AtSign, Bell, CornerUpLeft, MessageCircle, ShieldAlert, Ticket, Users } from 'lucide-react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { Orb } from '../../components/ui/orb';
import { UserAvatar } from '../../components/user/UserAvatar';
import { describeNotification } from './describe';

const ICONS: Record<string, typeof Bell> = {
  dm: MessageCircle,
  mention: AtSign,
  reply: CornerUpLeft,
  invite: Ticket,
  community: Users,
  moderation: ShieldAlert,
  system: Bell,
};

export function NotificationRow({ n, onRead }: { n: NotificationDTO; onRead: (id: string) => void }) {
  const d = describeNotification(n);
  const Icon = ICONS[n.type] ?? Bell;
  const unread = !n.readAt;
  const body = (
    <>
      <span className="relative shrink-0">
        {n.actor ? (
          <UserAvatar name={n.actor.displayName} src={n.actor.avatarUrl} size="lg" />
        ) : (
          <Orb icon={Icon} size="md" tone="neutral" />
        )}
        {n.actor && (
          <span className="gloss absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-accent-fg shadow-sm">
            <Icon className="size-3" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-ui', unread ? 'font-semibold text-fg' : 'text-fg-2')}>{d.text}</span>
        {d.detail && <span className="mt-0.5 line-clamp-2 block text-sm text-fg-muted">{d.detail}</span>}
        <span className="mt-1 block font-mono text-[11px] text-fg-muted">{formatRelative(n.updatedAt)}</span>
      </span>
      {unread && (
        <span
          aria-label={t('common.labels.new')}
          className="mt-2 size-2.5 shrink-0 rounded-full bg-accent-text shadow-[0_0_6px_var(--accent-glow)]"
        />
      )}
    </>
  );
  const cls = cn('aero-item flex items-start gap-3 rounded-xl px-3 py-3', unread && 'bg-accent-soft/40');
  return d.href ? (
    <Link to={d.href} className={cls} onClick={() => unread && onRead(n.id)}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cn(cls, 'w-full text-left')} onClick={() => unread && onRead(n.id)}>
      {body}
    </button>
  );
}
