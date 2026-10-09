import type { SearchResultDTO, UserSummary } from '@creator-network/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Hash, MessageCircle, Paperclip, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { renderHighlight } from '../../lib/markdown';
import { useChat } from '../../stores/chat';
import { DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Field, Input, Select } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { UserAvatar } from '../../components/user/UserAvatar';
import { CommunityCard, useExplore } from '../explore/ExplorePage';
import { PageLayout } from '../shell/SidebarLayout';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function ResultRow({ r }: { r: SearchResultDTO }) {
  const href = r.communityId
    ? `/c/${r.communityId}/${r.message.channelId}?m=${r.message.id}`
    : `/dm/${r.message.channelId}`;
  const dmName = useChat((s) => {
    const d = s.dms[r.message.channelId];
    return d ? d.name || d.participants.map((p) => p.displayName).join(', ') : null;
  });
  return (
    <Link to={href} className="tile tile-link block p-3" aria-label={t('search.jump')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
        {r.channelKind === 'text' ? (
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" />
            {r.channelName}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" /> {dmName ?? t('search.inDm')}
          </span>
        )}
        {r.communityName && <span>· {r.communityName}</span>}
        <span className="ml-auto font-mono text-[10.5px]">{formatDateTime(r.message.createdAt)}</span>
      </div>
      <div className="flex gap-2.5">
        <UserAvatar name={r.message.author?.displayName ?? '?'} src={r.message.author?.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            {r.message.author?.displayName ?? t('common.labels.deletedUser')}{' '}
            {r.message.author?.isDemo && <DemoBadge />}
          </p>
          <p className="text-sm break-words whitespace-pre-wrap text-fg-2">{renderHighlight(r.highlight)}</p>
          {r.message.attachments.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
              <Paperclip className="size-3" /> {r.message.attachments.map((a) => a.name).join(', ')}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const communities = useChat((s) => s.communities);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [showFilters, setShowFilters] = useState(!!(params.get('author') || params.get('has')));
  const communityId = params.get('communityId') ?? '';
  const channelId = params.get('channelId') ?? '';
  const author = params.get('author') ?? '';
  const has = params.get('has') ?? '';
  const debounced = useDebounced(q.trim(), 300);
  const tab = params.get('tab') ?? 'messages';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'communityId') next.delete('channelId');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setParam('q', debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const searchKey = { q: debounced, communityId, channelId, author: author.replace(/^@/, '').toLowerCase(), has };
  const enabled = tab === 'messages' && (debounced.length > 0 || !!searchKey.author || !!has || !!channelId);
  const messages = useInfiniteQuery({
    queryKey: ['search', searchKey],
    enabled,
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams(
        Object.entries({ ...searchKey, before: pageParam }).filter(([, v]) => v) as [string, string][],
      );
      return api.get<{ results: SearchResultDTO[]; nextBefore: string | null }>(`/api/search/messages?${qs}`);
    },
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const people = useQuery({
    queryKey: ['user-search', debounced],
    queryFn: () =>
      api.get<{ users: UserSummary[] }>(`/api/users/search?q=${encodeURIComponent(debounced)}`).then((r) => r.users),
    enabled: tab === 'people' && debounced.length > 0,
  });
  const explore = useExplore(tab === 'communities' ? debounced : '', null);
  const results = useMemo(() => messages.data?.pages.flatMap((p) => p.results) ?? [], [messages.data]);
  const channelOptions = communityId ? (communities[communityId]?.channels ?? []) : [];

  return (
    <PageLayout label={t('search.title')}>
      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
          <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight text-fg">{t('search.title')}</h1>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                aria-label={t('search.placeholder')}
                className="h-11 pl-9"
                type="search"
                data-testid="search-input"
              />
            </div>
            <Button
              variant={showFilters ? 'primary' : 'secondary'}
              size="icon"
              className="size-11"
              aria-label={t('search.filters')}
              aria-pressed={showFilters}
              onClick={() => setShowFilters((s) => !s)}
            >
              <SlidersHorizontal />
            </Button>
          </div>
          {showFilters && (
            <div className="mt-3 grid gap-3 tile p-3 sm:grid-cols-2 animate-pop-in">
              <Field label={t('search.community')}>
                {(p) => (
                  <Select {...p} value={communityId} onChange={(e) => setParam('communityId', e.target.value)}>
                    <option value="">{t('search.anyCommunity')}</option>
                    {Object.values(communities).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('search.channel')}>
                {(p) => (
                  <Select
                    {...p}
                    value={channelId}
                    onChange={(e) => setParam('channelId', e.target.value)}
                    disabled={!communityId}
                  >
                    <option value="">{t('search.anyChannel')}</option>
                    {channelOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('search.author')}>
                {(p) => (
                  <Input
                    {...p}
                    value={author}
                    onChange={(e) => setParam('author', e.target.value)}
                    placeholder={t('search.authorPlaceholder')}
                  />
                )}
              </Field>
              <Field label={t('search.has')}>
                {(p) => (
                  <Select {...p} value={has} onChange={(e) => setParam('has', e.target.value)}>
                    <option value="">{t('search.hasAny')}</option>
                    {(['file', 'image', 'audio', 'link'] as const).map((h) => (
                      <option key={h} value={h}>
                        {t(`search.hasOptions.${h}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}
          <Tabs value={tab} onValueChange={(v) => setParam('tab', v === 'messages' ? '' : v)} className="mt-5">
            <TabsList className="mb-4">
              <TabsTrigger value="messages">{t('search.tabs.messages')}</TabsTrigger>
              <TabsTrigger value="people">{t('search.tabs.people')}</TabsTrigger>
              <TabsTrigger value="communities">{t('search.tabs.communities')}</TabsTrigger>
            </TabsList>
            <TabsContent value="messages">
              {!enabled ? (
                <EmptyState icon={SearchIcon} title={t('search.prompt')} />
              ) : messages.isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <EmptyState icon={SearchIcon} title={t('search.empty')} />
              ) : (
                <>
                  <p className="mb-2 text-xs text-fg-muted" role="status">
                    {t('search.results', { count: results.length })}
                    {messages.hasNextPage ? '+' : ''}
                  </p>
                  <ul className="flex flex-col gap-2" data-testid="search-results">
                    {results.map((r) => (
                      <li key={r.message.id}>
                        <ResultRow r={r} />
                      </li>
                    ))}
                  </ul>
                  {messages.hasNextPage && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        size="sm"
                        loading={messages.isFetchingNextPage}
                        onClick={() => void messages.fetchNextPage()}
                      >
                        {t('common.actions.loadMore')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
            <TabsContent value="people">
              {people.data?.length === 0 && <p className="text-sm text-fg-muted">{t('search.peopleEmpty')}</p>}
              <ul className="flex flex-col gap-1">
                {people.data?.map((u) => (
                  <li key={u.id}>
                    <Link to={`/u/${u.username}`} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-hover">
                      <UserAvatar name={u.displayName} src={u.avatarUrl} size="lg" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold text-fg">
                          {u.displayName} {u.isDemo && <DemoBadge />}
                        </span>
                        <span className={cn('block truncate text-sm text-fg-muted')}>
                          @{u.username}
                          {u.headline ? ` · ${u.headline}` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="communities">
              <div className="grid gap-3 sm:grid-cols-2">
                {explore.data?.map((c) => (
                  <CommunityCard key={c.id} c={c} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
