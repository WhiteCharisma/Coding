import { COMMUNITY_TAGS, type CommunityDTO, type CommunitySummary, type CommunityTag } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { Compass, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { PageLayout } from '../shell/SidebarLayout';

export function CommunityCard({ c, onJoined }: { c: CommunitySummary; onJoined?: (c: CommunityDTO) => void }) {
  const joined = useChat((s) => !!s.communities[c.id]);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      const { community } = await api.post<{ community: CommunityDTO }>(`/api/communities/${c.id}/join`);
      useChat.getState().upsertCommunity(community);
      if (onJoined) onJoined(community);
      else void navigate(`/c/${community.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="group flex flex-col rounded-xl border border-line-subtle bg-sidebar/70 p-4 transition-[border-color,transform,box-shadow] duration-[var(--dur-base)] ease-out hover:-translate-y-0.5 hover:border-line hover:shadow-md">
      <div className="flex items-start gap-3">
        <CommunityIcon name={c.name} src={c.iconUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base leading-snug font-semibold tracking-tight text-fg">
            <span className="line-clamp-2 break-words">{c.name}</span>
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
            <Users className="size-3.5" /> {t('common.labels.members', { count: c.memberCount })}
            {c.isDemo && <DemoBadge className="ml-1.5" />}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 flex-1 text-sm text-fg-2">{c.description}</p>
      {c.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1">
          {c.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-active px-2 py-0.5 text-[11px] text-fg-2">
              {t(`common.tags.${tag}`)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {joined ? (
          <Button className="w-full" onClick={() => void navigate(`/c/${c.id}`)}>
            {t('explore.open')}
          </Button>
        ) : (
          <Button className="w-full" variant="primary" loading={busy} onClick={() => void join()}>
            {t('explore.join')}
          </Button>
        )}
      </div>
    </article>
  );
}

export function useExplore(q: string, tag: CommunityTag | null) {
  return useQuery({
    queryKey: ['explore', q, tag],
    queryFn: () => api.get<{ communities: CommunitySummary[] }>(`/api/communities/explore?${new URLSearchParams({ ...(q ? { q } : {}), ...(tag ? { tag } : {}) })}`).then((r) => r.communities),
  });
}

export default function ExplorePage() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<CommunityTag | null>(null);
  const list = useExplore(q.trim(), tag);
  return (
    <PageLayout label={t('explore.title')}>
      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
          <header className="mb-6">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">{t('explore.title')}</h1>
            <p className="mt-1 text-fg-muted">{t('explore.subtitle')}</p>
          </header>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('explore.search')} aria-label={t('explore.search')} className="h-11 pl-9" />
          </div>
          <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto pb-1">
            {[null, ...COMMUNITY_TAGS].map((tg) => (
              <button
                key={tg ?? 'all'}
                type="button"
                aria-pressed={tag === tg}
                onClick={() => setTag(tg)}
                className={cn('shrink-0 rounded-full border px-3 py-1 text-sm transition-colors', tag === tg ? 'border-accent-border bg-accent-soft text-accent-text' : 'border-line text-fg-2 hover:border-line-strong')}
              >
                {tg ? t(`common.tags.${tg}`) : t('explore.allTags')}
              </button>
            ))}
          </div>
          {list.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          ) : list.data?.length === 0 ? (
            <EmptyState icon={Compass} title={t('explore.empty')} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.data?.map((c) => (
                <CommunityCard key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
