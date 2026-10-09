import type { NotificationDTO } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, AtSign, Check, Compass, Hash, MailCheck, Plus, UserPen, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getLocale, t } from '../../i18n';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { communityUnread, dmDisplayName, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { CountBadge, DemoBadge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Orb } from '../../components/ui/orb';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { UserAvatar } from '../../components/user/UserAvatar';
import { CreateJoinDialog } from '../community/CreateJoinDialog';
import { DmSidebar } from '../dm/DmSidebar';
import { NotificationRow } from '../notifications/NotificationRow';
import { SidebarLayout } from '../shell/SidebarLayout';

function greetingKey(now: Date): 'morning' | 'afternoon' | 'evening' {
  const h = now.getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="animate-rise-in">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 text-ui font-semibold text-accent-text">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-linear-to-r from-line-strong to-transparent" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function HomePage() {
  const user = useSession((s) => s.user);
  const config = useSession((s) => s.config);
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const unreads = useChat((s) => s.unreads);
  const dms = useChat((s) => s.dms);
  const [createOpen, setCreateOpen] = useState(false);
  const [now] = useState(() => new Date());
  const today = new Intl.DateTimeFormat(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const mentions = useQuery({
    queryKey: ['notifications', 'home'],
    queryFn: () =>
      api
        .get<{ notifications: NotificationDTO[] }>('/api/notifications?types=mention,reply&limit=5')
        .then((r) => r.notifications),
  });

  const active = useMemo(() => {
    const rows: {
      communityId: string;
      communityName: string;
      iconUrl: string | null;
      channelId: string;
      channelName: string;
      unread: number;
      mentions: number;
      at: number;
    }[] = [];
    const muted = new Set(user?.mutedCommunityIds ?? []);
    for (const c of Object.values(communities)) {
      if (muted.has(c.id)) continue;
      for (const ch of c.channels) {
        const u = unreads[ch.id];
        if (u && u.unread > 0)
          rows.push({
            communityId: c.id,
            communityName: c.name,
            iconUrl: c.iconUrl,
            channelId: ch.id,
            channelName: ch.name,
            unread: u.unread,
            mentions: u.mentions,
            at: ch.lastMessageAt ?? 0,
          });
      }
    }
    return rows.sort((a, b) => b.mentions - a.mentions || b.at - a.at).slice(0, 6);
  }, [communities, unreads, user?.mutedCommunityIds]);

  const unreadDms = Object.values(dms)
    .filter((d) => (unreads[d.id]?.unread ?? 0) > 0)
    .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
    .slice(0, 5);

  if (!user) return null;
  const firstName = user.displayName.split(' ')[0] ?? user.displayName;
  const steps = [
    {
      key: 'profile',
      done: !!user.headline && user.disciplines.length > 0,
      icon: UserPen,
      title: t('home.stepProfile'),
      body: t('home.stepProfileBody'),
      to: '/settings/profile',
    },
    {
      key: 'community',
      done: order.length > 0,
      icon: Compass,
      title: t('home.stepCommunity'),
      body: t('home.stepCommunityBody'),
      to: '/explore',
    },
    {
      key: 'invite',
      done: false,
      icon: UserPlus,
      title: t('home.stepInvite'),
      body: t('home.stepInviteBody'),
      to: order[0] ? `/c/${order[0]}` : '/explore',
    },
    ...(config?.emailEnabled
      ? [
          {
            key: 'verify',
            done: user.emailVerified,
            icon: MailCheck,
            title: t('home.stepVerify'),
            body: t('home.stepVerifyBody'),
            to: '/settings/account',
          },
        ]
      : []),
  ];

  return (
    <SidebarLayout mobileView="content" sidebar={<DmSidebar />} contentLabel={t('shell.nav.home')}>
      <div className="scroll-area flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-9 px-4 py-8 md:px-8 md:py-10">
          <header className="tile relative overflow-hidden p-6 animate-rise-in md:p-8">
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 w-2/5 bg-linear-to-l from-sky-3/70 via-sky-4/30 to-transparent max-sm:hidden"
            />
            <div
              aria-hidden
              className="absolute -top-20 right-6 size-56 rounded-full bg-[radial-gradient(circle,var(--sun),transparent_62%)] opacity-80 max-md:hidden dark:opacity-35"
            />
            <span aria-hidden className="bubble absolute top-6 right-[18%] size-10 max-sm:hidden" />
            <span aria-hidden className="bubble absolute right-[8%] bottom-5 size-16 max-sm:hidden" />
            <p className="relative text-xs font-semibold tracking-[0.12em] text-accent-text uppercase">{today}</p>
            <h1 className="relative mt-1 font-display text-3xl font-semibold tracking-tight text-fg md:text-4xl">
              {t(`home.greeting.${greetingKey(now)}`, { name: firstName })}
            </h1>
            <p className="relative mt-1 text-fg-muted">{t('home.subtitle')}</p>
          </header>

          {order.length === 0 ? (
            <EmptyState
              icon={Hash}
              title={t('home.emptyTitle')}
              body={t('home.emptyBody')}
              actions={
                <>
                  <Link to="/explore" className={buttonVariants({ variant: 'secondary' })}>
                    <Compass /> {t('shell.nav.exploreShort')}
                  </Link>
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    <Plus /> {t('community.create.submit')}
                  </Button>
                </>
              }
            />
          ) : (
            <Section title={t('home.continue')}>
              {active.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
                  {t('home.continueEmpty')}
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {active.map((r) => (
                    <li key={r.channelId}>
                      <Link
                        to={`/c/${r.communityId}/${r.channelId}`}
                        className="tile tile-link group flex items-center gap-3 p-3"
                      >
                        <CommunityIcon name={r.communityName} src={r.iconUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ui font-semibold text-fg">#{r.channelName}</span>
                          <span className="block truncate text-xs text-fg-muted">
                            {r.communityName} · {formatRelative(r.at)}
                          </span>
                        </span>
                        {r.mentions > 0 ? (
                          <CountBadge count={r.mentions} tone="danger" />
                        ) : (
                          <span className="font-mono text-[11px] text-fg-muted">
                            {t('home.unreadCount', { count: r.unread })}
                          </span>
                        )}
                        <ArrowRight className="size-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {unreadDms.length > 0 && (
            <Section title={t('home.unreadDms')}>
              <ul className="flex flex-col gap-1.5">
                {unreadDms.map((d) => {
                  const other = d.participants.find((p) => p.id !== user.id);
                  return (
                    <li key={d.id}>
                      <Link to={`/dm/${d.id}`} className="tile tile-link flex items-center gap-3 p-3">
                        <UserAvatar name={other?.displayName ?? '?'} src={other?.avatarUrl} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ui font-semibold text-fg">
                            {dmDisplayName(d, user.id)}
                          </span>
                          <span className="block truncate text-xs text-fg-muted">{d.lastMessagePreview}</span>
                        </span>
                        <CountBadge count={unreads[d.id]?.unread ?? 0} tone="danger" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <Section
            title={t('home.mentions')}
            action={
              <Link to="/notifications" className="text-xs font-medium text-accent-text hover:underline">
                {t('notifications.title')}
              </Link>
            }
          >
            {mentions.data && mentions.data.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {mentions.data.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} onRead={(id) => void api.post('/api/notifications/read', { ids: [id] })} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-5 text-sm text-fg-muted">
                <AtSign className="size-4" /> {t('home.noMentions')}
              </p>
            )}
          </Section>

          {order.length > 0 && (
            <Section title={t('home.yourCommunities')}>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {order.map((id) => {
                  const c = communities[id];
                  if (!c) return null;
                  const u = communityUnread(c, unreads, user.mutedCommunityIds.includes(c.id));
                  return (
                    <li key={id}>
                      <Link to={`/c/${c.id}`} className="tile tile-link flex h-full flex-col items-start gap-3 p-3">
                        <span className="relative">
                          <CommunityIcon name={c.name} src={c.iconUrl} size="md" />
                          {u.unread && (
                            <span
                              className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent-text shadow-[0_0_6px_var(--accent-glow)] ring-2 ring-elevated"
                              aria-hidden
                            />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                            <span className="line-clamp-1">{c.name}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                            {t('common.labels.members', { count: c.memberCount })} {c.isDemo && <DemoBadge />}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <Section title={t('home.nextSteps')}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {steps.map((s) => (
                <li key={s.key}>
                  <Link
                    to={s.to}
                    className={cn(
                      'flex items-start gap-3 p-3',
                      s.done ? 'rounded-xl border border-line-subtle' : 'tile tile-link',
                    )}
                  >
                    <Orb icon={s.done ? Check : s.icon} size="md" tone={s.done ? 'success' : 'accent'} />
                    <span>
                      <span
                        className={cn('block text-ui font-medium', s.done ? 'text-fg-muted line-through' : 'text-fg')}
                      >
                        {s.title}
                      </span>
                      <span className="block text-xs text-fg-muted">{s.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
      <CreateJoinDialog open={createOpen} onOpenChange={setCreateOpen} />
    </SidebarLayout>
  );
}
