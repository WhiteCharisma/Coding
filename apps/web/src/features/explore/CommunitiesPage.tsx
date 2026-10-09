import { Compass, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { communityUnread, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { CountBadge, DemoBadge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { CreateJoinDialog } from '../community/CreateJoinDialog';
import { PageLayout } from '../shell/SidebarLayout';

/** Phone-friendly list of joined communities (desktop uses the navigation rail). */
export default function CommunitiesPage() {
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const unreads = useChat((s) => s.unreads);
  const user = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  const muted = new Set(user?.mutedCommunityIds ?? []);
  return (
    <PageLayout label={t('shell.nav.communities')}>
      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{t('shell.nav.communities')}</h1>
            <div className="flex gap-2">
              <Link to="/explore" className={buttonVariants({ size: 'sm' })}>
                <Compass /> {t('shell.nav.exploreShort')}
              </Link>
              <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
                <Plus /> {t('common.actions.create')}
              </Button>
            </div>
          </div>
          {order.length === 0 && <p className="text-sm text-fg-muted">{t('home.emptyBody')}</p>}
          <ul className="flex flex-col gap-1.5">
            {order.map((id) => {
              const c = communities[id];
              if (!c) return null;
              const u = communityUnread(c, unreads, muted.has(c.id));
              return (
                <li key={id}>
                  <Link to={`/c/${c.id}`} className="flex items-center gap-3 rounded-xl border border-line-subtle bg-sidebar/60 p-3 transition-colors hover:border-line">
                    <CommunityIcon name={c.name} src={c.iconUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold text-fg">
                        <span className="truncate">{c.name}</span> {c.isDemo && <DemoBadge />}
                      </span>
                      <span className="text-xs text-fg-muted">{t('common.labels.members', { count: c.memberCount })}</span>
                    </span>
                    {u.mentions > 0 ? <CountBadge count={u.mentions} tone="danger" /> : u.unread ? <span className="size-2 rounded-full bg-fg" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <CreateJoinDialog open={open} onOpenChange={setOpen} />
    </PageLayout>
  );
}
