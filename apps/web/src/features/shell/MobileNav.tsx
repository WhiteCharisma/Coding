import { Bell, Home, LayoutGrid, MessageCircle, UserRound } from 'lucide-react';
import { NavLink } from 'react-router';
import { t } from '../../i18n';
import { communityUnread, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { CountBadge } from '../../components/ui/badge';

export function MobileNav() {
  const user = useSession((s) => s.user);
  const unreads = useChat((s) => s.unreads);
  const dms = useChat((s) => s.dms);
  const communities = useChat((s) => s.communities);
  const notifications = useChat((s) => s.unreadNotifications);
  const dmMentions = Object.keys(dms).reduce((sum, id) => sum + (unreads[id]?.mentions ?? 0), 0);
  const muted = new Set(user?.mutedCommunityIds ?? []);
  const communityMentions = Object.values(communities).reduce(
    (sum, c) => sum + communityUnread(c, unreads, muted.has(c.id)).mentions,
    0,
  );

  const items = [
    { to: '/home', label: t('shell.nav.home'), icon: Home, badge: 0 },
    { to: '/communities', label: t('shell.nav.communities'), icon: LayoutGrid, badge: communityMentions },
    { to: '/dm', label: t('shell.nav.messagesShort'), icon: MessageCircle, badge: dmMentions },
    { to: '/notifications', label: t('shell.nav.notifications'), icon: Bell, badge: notifications },
    { to: user ? `/u/${user.username}` : '/settings', label: t('shell.nav.you'), icon: UserRound, badge: 0 },
  ];

  return (
    <nav
      aria-label={t('shell.nav.primary')}
      className="taskbar-glass fixed inset-x-0 bottom-0 z-[var(--z-rail)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex h-[var(--mobile-nav-height)] max-w-lg items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className="tab-item group relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors"
            >
              <span className="tab-icon relative grid h-8 w-12 place-items-center rounded-full transition-colors">
                <Icon className="size-[22px]" />
                {badge > 0 && (
                  <CountBadge
                    count={badge}
                    tone="danger"
                    className="absolute -top-1.5 -right-2.5 ring-2 ring-[var(--taskbar-lo)]"
                  />
                )}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
