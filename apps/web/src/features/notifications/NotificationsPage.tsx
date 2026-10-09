import type { NotificationDTO, NotificationType } from '@creator-network/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { useChat } from '../../stores/chat';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { PageLayout } from '../shell/SidebarLayout';
import { NotificationRow } from './NotificationRow';

type FilterKey = 'all' | 'unread' | 'mentions' | 'replies' | 'dm' | 'invites' | 'community' | 'moderation';
const FILTERS: { key: FilterKey; types: NotificationType[] | null; unread?: boolean }[] = [
  { key: 'all', types: null },
  { key: 'unread', types: null, unread: true },
  { key: 'mentions', types: ['mention'] },
  { key: 'replies', types: ['reply'] },
  { key: 'dm', types: ['dm'] },
  { key: 'invites', types: ['invite'] },
  { key: 'community', types: ['community'] },
  { key: 'moderation', types: ['moderation', 'system'] },
];

export default function NotificationsPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const qc = useQueryClient();
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const query = useInfiniteQuery({
    queryKey: ['notifications', filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<{ notifications: NotificationDTO[]; unread: number }>(
        `/api/notifications?${new URLSearchParams({ limit: '40', ...(pageParam ? { before: String(pageParam) } : {}), ...(f?.types ? { types: f.types.join(',') } : {}), ...(f?.unread ? { unread: '1' } : {}) })}`,
      ),
    getNextPageParam: (last) =>
      last.notifications.length === 40 ? last.notifications[last.notifications.length - 1]?.updatedAt : undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.notifications) ?? [];

  const markRead = async (ids: string[] | 'all') => {
    try {
      const res = await api.post<{ unread: number }>('/api/notifications/read', { ids });
      useChat.getState().setUnreadNotifications(res.unread);
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <PageLayout label={t('notifications.title')}>
      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{t('notifications.title')}</h1>
            <Button size="sm" onClick={() => void markRead('all')}>
              <CheckCheck /> {t('common.actions.markAllRead')}
            </Button>
          </div>
          <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
            {FILTERS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={filter === x.key}
                onClick={() => setFilter(x.key)}
                className="chip px-3 py-1 text-sm"
              >
                {t(`notifications.filters.${x.key}`)}
              </button>
            ))}
          </div>
          {query.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === 'all' ? t('notifications.empty') : t('notifications.emptyFiltered')}
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow n={n} onRead={(id) => void markRead([id])} />
                </li>
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                {t('common.actions.loadMore')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
