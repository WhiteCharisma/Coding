import {
  Ban,
  CalendarDays,
  ExternalLink,
  Flag,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  SearchX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { formatDate, localTimeIn } from '../../lib/format';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { Badge, DemoBadge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { EmptyState } from '../../components/ui/empty-state';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { UserAvatar } from '../../components/user/UserAvatar';
import { openDmWith } from '../dm/NewDmDialog';
import { ReportDialog } from '../report/ReportDialog';
import { PageLayout } from '../shell/SidebarLayout';
import { bannerStyle, useProfile } from './useProfile';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line-subtle bg-sidebar/60 p-4">
      <h2 className="mb-2 text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const { username = '' } = useParams();
  const me = useSession((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useProfile(username.toLowerCase());
  const p = profile.data;
  const presence = useChat((s) => (p ? (s.presence[p.id] ?? 'offline') : 'offline'));
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (profile.isError) {
    return (
      <PageLayout>
        <div className="grid flex-1 place-items-center">
          <EmptyState
            icon={SearchX}
            title={t('profile.notFound')}
            actions={
              <Link to="/home" className={buttonVariants({ variant: 'primary' })}>
                {t('common.errors.goHome')}
              </Link>
            }
          />
        </div>
      </PageLayout>
    );
  }

  const self = p?.id === me?.id;
  const local = p?.timezone ? localTimeIn(p.timezone) : null;

  return (
    <PageLayout label={p?.displayName}>
      <div className="scroll-area flex-1">
        <div className="h-36 md:h-48" style={bannerStyle(p?.bannerHue ?? null)} />
        <div className="mx-auto max-w-3xl px-4 pb-16 md:px-8">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
            {p ? (
              <UserAvatar
                name={p.displayName}
                src={p.avatarUrl}
                size="2xl"
                presence={presence}
                className="rounded-full ring-6 ring-main"
              />
            ) : (
              <Skeleton className="size-24 rounded-full" />
            )}
            {p && (
              <div className="flex gap-2 pb-1">
                {self ? (
                  <Link to="/settings/profile" className={buttonVariants({ variant: 'secondary' })}>
                    <Pencil /> {t('profile.editProfile')}
                  </Link>
                ) : (
                  <>
                    {p.canMessage && (
                      <Button
                        variant="primary"
                        onClick={() =>
                          void openDmWith([p.id])
                            .then((dm) => navigate(`/dm/${dm.id}`))
                            .catch((err: unknown) => toast.error(errorMessage(err)))
                        }
                      >
                        <MessageCircle /> {t('profile.sendMessage')}
                      </Button>
                    )}
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="secondary" size="icon" aria-label={t('common.actions.more')}>
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => setBlockOpen(true)}>
                          <Ban /> {p.isBlocked ? t('profile.unblock') : t('profile.block')}
                        </MenuItem>
                        <MenuItem danger onSelect={() => setReportOpen(true)}>
                          <Flag /> {t('profile.report')}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </>
                )}
              </div>
            )}
          </div>
          {!p ? (
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <>
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">{p.displayName}</h1>
                  {p.isDemo && <DemoBadge />}
                  {p.platformRole !== 'member' && (
                    <Badge tone="info">
                      {t(`common.labels.${p.platformRole === 'admin' ? 'admin' : 'moderator'}`)}
                    </Badge>
                  )}
                </div>
                <p className="text-fg-muted">@{p.username}</p>
                {p.headline && <p className="mt-2 text-lg text-fg-2">{p.headline}</p>}
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg-muted">
                  {p.location && (
                    <li className="flex items-center gap-1.5">
                      <MapPin className="size-4" /> {p.location}
                    </li>
                  )}
                  {local && <li className="font-mono text-xs leading-5">{t('profile.localTime', { time: local })}</li>}
                  <li className="flex items-center gap-1.5">
                    <CalendarDays className="size-4" /> {t('profile.memberSince', { date: formatDate(p.createdAt) })}
                  </li>
                </ul>
                {p.isBlocked && (
                  <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{t('profile.blocked')}</p>
                )}
                {!self && !p.canMessage && !p.isBlocked && (
                  <p className="mt-3 text-sm text-fg-muted">{t('profile.cannotMessage')}</p>
                )}
              </div>
              {p.disciplines.length > 0 && (
                <ul aria-label={t('profile.disciplines')} className="mt-5 flex flex-wrap gap-1.5">
                  {p.disciplines.map((d) => (
                    <li
                      key={d}
                      className="rounded-full border border-accent-border/60 bg-accent-soft px-3 py-1 text-sm text-accent-text"
                    >
                      {t(`common.disciplines.${d}`)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {p.bio && (
                  <div className="md:col-span-2">
                    <Card title={t('profile.about')}>
                      <p className="text-base whitespace-pre-wrap text-fg-2">{p.bio}</p>
                    </Card>
                  </div>
                )}
                {p.currentProjects && (
                  <Card title={t('profile.projects')}>
                    <p className="text-sm whitespace-pre-wrap text-fg-2">{p.currentProjects}</p>
                  </Card>
                )}
                {p.links.length > 0 && (
                  <Card title={t('profile.links')}>
                    <ul className="flex flex-col gap-1.5">
                      {p.links.map((l) => (
                        <li key={l.url}>
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline"
                          >
                            <ExternalLink className="size-3.5" /> {l.label}
                            <span className="text-fg-muted">{new URL(l.url).hostname}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {p.mutualCommunities.length > 0 && (
                  <Card title={t('profile.mutual')}>
                    <ul className="flex flex-col gap-1">
                      {p.mutualCommunities.map((c) => (
                        <li key={c.id}>
                          <Link to={`/c/${c.id}`} className="flex items-center gap-2.5 rounded-md p-1 hover:bg-hover">
                            <CommunityIcon name={c.name} src={c.iconUrl} size="sm" />
                            <span className="truncate text-sm text-fg-2">{c.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
              <ConfirmDialog
                open={blockOpen}
                onOpenChange={setBlockOpen}
                title={p.isBlocked ? t('profile.unblock') : t('profile.blockTitle', { name: p.displayName })}
                body={p.isBlocked ? undefined : t('profile.blockBody')}
                confirmLabel={p.isBlocked ? t('profile.unblock') : t('profile.block')}
                danger={!p.isBlocked}
                onConfirm={async () => {
                  if (p.isBlocked) await api.del(`/api/users/${p.id}/block`);
                  else await api.put(`/api/users/${p.id}/block`);
                  await qc.invalidateQueries({ queryKey: ['profile', p.username] });
                  await qc.invalidateQueries({ queryKey: ['blocks'] });
                }}
              />
              {reportOpen && (
                <ReportDialog
                  open={reportOpen}
                  onOpenChange={setReportOpen}
                  target={{ type: 'user', id: p.id, label: t('report.user', { username: p.username }) }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
