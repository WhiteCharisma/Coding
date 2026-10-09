import { Bell, Compass, MessageCircle, Plus, Search, Settings, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { communityUnread, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { LogoMark } from '../../components/brand/Logo';
import { CountBadge } from '../../components/ui/badge';
import { Tooltip } from '../../components/ui/tooltip';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { CreateJoinDialog } from '../community/CreateJoinDialog';
import { UserMenu } from './UserMenu';

/** The left edge "pill" that signals active / unread state, like a channel strip LED. */
function Indicator({ active, unread }: { active: boolean; unread: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-1/2 -left-3 w-1 -translate-y-1/2 rounded-r-full bg-fg transition-[height,opacity,background-color] duration-[var(--dur-base)] ease-out',
        active ? 'h-8 bg-accent opacity-100' : unread ? 'h-2 opacity-100' : 'h-4 opacity-0 group-hover:opacity-60',
      )}
    />
  );
}

interface RailItemProps {
  to?: string;
  onClick?: () => void;
  label: string;
  active: boolean;
  unread?: boolean;
  badge?: number;
  children: ReactNode;
  testId?: string;
}

function RailItem({ to, onClick, label, active, unread = false, badge = 0, children, testId }: RailItemProps) {
  const inner = (
    <>
      <Indicator active={active} unread={unread} />
      <span
        className={cn(
          'grid size-12 place-items-center overflow-hidden rounded-2xl transition-[border-radius,background-color,color] duration-[var(--dur-base)] ease-out',
          active ? 'rounded-xl bg-accent text-accent-fg' : 'bg-sidebar text-fg-2 group-hover:rounded-xl group-hover:bg-elevated group-hover:text-fg',
        )}
      >
        {children}
      </span>
      {badge > 0 && <CountBadge count={badge} tone="danger" className="absolute -right-1 -bottom-1 ring-3 ring-rail" />}
    </>
  );
  const cls = 'group relative grid place-items-center outline-offset-4';
  return (
    <Tooltip content={label} side="right">
      {to ? (
        <Link to={to} aria-label={label} aria-current={active ? 'page' : undefined} className={cls} data-testid={testId}>
          {inner}
        </Link>
      ) : (
        <button type="button" aria-label={label} onClick={onClick} className={cls} data-testid={testId}>
          {inner}
        </button>
      )}
    </Tooltip>
  );
}

export function NavRail() {
  const location = useLocation();
  const user = useSession((s) => s.user);
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const unreads = useChat((s) => s.unreads);
  const dms = useChat((s) => s.dms);
  const notifications = useChat((s) => s.unreadNotifications);
  const [createOpen, setCreateOpen] = useState(false);
  const path = location.pathname;
  const dmMentions = Object.keys(dms).reduce((sum, id) => sum + (unreads[id]?.mentions ?? 0), 0);
  const muted = new Set(user?.mutedCommunityIds ?? []);

  return (
    <nav aria-label={t('shell.nav.primary')} className="z-[var(--z-rail)] hidden w-[var(--rail-width)] shrink-0 flex-col items-center bg-rail py-3 md:flex">
      <div className="flex flex-col items-center gap-2">
        <RailItem to="/home" label={t('shell.nav.home')} active={path === '/home'}>
          <LogoMark className="size-7" />
        </RailItem>
        <RailItem to="/dm" label={t('shell.nav.messages')} active={path.startsWith('/dm')} badge={dmMentions} testId="rail-dms">
          <MessageCircle className="size-5" />
        </RailItem>
        <RailItem to="/notifications" label={t('shell.nav.notifications')} active={path.startsWith('/notifications')} badge={notifications} testId="rail-notifications">
          <Bell className="size-5" />
        </RailItem>
        <RailItem to="/search" label={t('shell.nav.search')} active={path.startsWith('/search')}>
          <Search className="size-5" />
        </RailItem>
      </div>
      <div className="my-3 h-px w-8 shrink-0 bg-line" />
      <ul aria-label={t('shell.nav.yourCommunities')} className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-3 pt-1 pb-2">
        {order.map((id) => {
          const c = communities[id];
          if (!c) return null;
          const state = communityUnread(c, unreads, muted.has(c.id));
          const active = path.startsWith(`/c/${c.id}`);
          return (
            <li key={id}>
              <RailItem to={`/c/${c.id}`} label={c.name} active={active} unread={state.unread} badge={state.mentions}>
                <CommunityIcon name={c.name} src={c.iconUrl} size="md" className={cn('rounded-[inherit]', active && 'ring-2 ring-accent')} />
              </RailItem>
            </li>
          );
        })}
        <li>
          <RailItem onClick={() => setCreateOpen(true)} label={t('shell.nav.addCommunity')} active={false} testId="rail-add-community">
            <Plus className="size-5 text-success" />
          </RailItem>
        </li>
        <li>
          <RailItem to="/explore" label={t('shell.nav.explore')} active={path.startsWith('/explore')}>
            <Compass className="size-5" />
          </RailItem>
        </li>
      </ul>
      <div className="mt-2 flex flex-col items-center gap-2 pt-2">
        {user && user.platformRole !== 'member' && (
          <RailItem to="/admin" label={t('shell.nav.admin')} active={path.startsWith('/admin')}>
            <ShieldCheck className="size-5" />
          </RailItem>
        )}
        <RailItem to="/settings" label={t('shell.nav.settings')} active={path.startsWith('/settings')}>
          <Settings className="size-5" />
        </RailItem>
        <UserMenu />
      </div>
      <CreateJoinDialog open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}
