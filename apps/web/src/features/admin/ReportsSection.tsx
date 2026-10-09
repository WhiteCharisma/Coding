import type { ReportDTO } from '@creator-network/shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Hash, MessageSquare, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { t, tMaybe } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, formatRelative } from '../../lib/format';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import { Segmented } from '../../components/ui/segmented';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { UserAvatar } from '../../components/user/UserAvatar';

type Status = ReportDTO['status'];
type Action = 'none' | 'delete_message' | 'warn_user' | 'suspend_user';

const TARGET_ICONS = { message: MessageSquare, user: UserRound, community: Users };

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function Snapshot({ r }: { r: ReportDTO }) {
  const s = r.snapshot;
  if (r.targetType === 'message') {
    const attachments = Array.isArray(s.attachments) ? (s.attachments as { name?: string }[]) : [];
    return (
      <div className="rounded-lg border border-line bg-inset p-3">
        <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <span className="font-semibold text-fg-2">{str(s.authorDisplayName) || t('common.labels.deletedUser')}</span>
          {str(s.authorUsername) && <span>@{str(s.authorUsername)}</span>}
          {str(s.channelName) && (
            <span className="inline-flex items-center gap-0.5">
              · <Hash className="size-3" />
              {str(s.channelName)}
            </span>
          )}
          {str(s.communityName) && <span>· {str(s.communityName)}</span>}
        </p>
        <p className="text-sm break-words whitespace-pre-wrap text-fg">{str(s.content)}</p>
        {attachments.length > 0 && <p className="mt-1 text-xs text-fg-muted">📎 {attachments.map((a) => a.name ?? '').join(', ')}</p>}
        {s.deleted === true && <p className="mt-1 text-xs text-warning">{t('admin.reports.messageDeleted')}</p>}
      </div>
    );
  }
  if (r.targetType === 'user') {
    return (
      <div className="rounded-lg border border-line bg-inset p-3 text-sm">
        <p className="font-semibold text-fg">
          {str(s.displayName)} <span className="font-normal text-fg-muted">@{str(s.username)}</span>
        </p>
        {str(s.headline) && <p className="text-fg-2">{str(s.headline)}</p>}
        {str(s.bio) && <p className="mt-1 whitespace-pre-wrap text-fg-muted">{str(s.bio)}</p>}
        {str(s.username) && (
          <Link to={`/u/${str(s.username)}`} className="mt-2 inline-block text-xs text-accent-text hover:underline">
            {t('admin.reports.viewProfile')}
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-inset p-3 text-sm">
      <p className="font-semibold text-fg">{str(s.name)}</p>
      {str(s.description) && <p className="mt-1 whitespace-pre-wrap text-fg-muted">{str(s.description)}</p>}
    </div>
  );
}

function ReportCard({ r, onDone }: { r: ReportDTO; onDone: () => void }) {
  const [action, setAction] = useState<Action>('none');
  const [note, setNote] = useState('');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState<'resolved' | 'dismissed' | null>(null);
  const Icon = TARGET_ICONS[r.targetType];
  const actions: Action[] = r.targetType === 'message' ? ['none', 'delete_message', 'warn_user', 'suspend_user'] : r.targetType === 'user' ? ['none', 'warn_user', 'suspend_user'] : ['none'];

  const submit = async (status: 'resolved' | 'dismissed') => {
    setBusy(status);
    try {
      const suspendDays = action === 'suspend_user' && days.trim() ? Number(days) : null;
      await api.post(`/api/admin/reports/${r.id}/resolve`, { status, note, action: status === 'dismissed' ? 'none' : action, suspendDays });
      toast.success(t('admin.reports.closed'));
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="rounded-xl border border-line-subtle bg-sidebar/60 p-4" data-testid="report-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="danger">
          <Flag className="size-3" /> {tMaybe(`report.reasons.${r.reason}`) ?? r.reason}
        </Badge>
        <Badge>
          <Icon className="size-3" /> {t(`admin.reports.target.${r.targetType}`)}
        </Badge>
        <span className="ml-auto text-xs text-fg-muted" title={formatDateTime(r.createdAt)}>
          {formatRelative(r.createdAt)}
        </span>
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
        {r.reporter && <UserAvatar name={r.reporter.displayName} src={r.reporter.avatarUrl} size="xs" />}
        {t('admin.reports.reportedBy', { name: r.reporter ? `${r.reporter.displayName} (@${r.reporter.username})` : t('common.labels.deletedUser') })}
      </p>
      {r.details && (
        <div className="mt-3">
          <p className="text-xs font-medium text-fg-2">{t('admin.reports.details')}</p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap text-fg">{r.details}</p>
        </div>
      )}
      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-fg-2">{t('admin.reports.snapshot')}</p>
        <Snapshot r={r} />
      </div>
      {r.status === 'open' ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-line-subtle pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('admin.reports.action')}>
              {(p) => (
                <Select {...p} value={action} onChange={(e) => setAction(e.target.value as Action)}>
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {t(`admin.reports.actions.${a}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {action === 'suspend_user' && (
              <Field label={t('admin.reports.suspendDays')}>{(p) => <Input {...p} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
            )}
          </div>
          <Field label={t('admin.reports.note')}>
            {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('admin.reports.notePlaceholder')} maxLength={500} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" loading={busy === 'dismissed'} disabled={busy !== null} onClick={() => void submit('dismissed')}>
              {t('admin.reports.dismiss')}
            </Button>
            <Button variant="primary" loading={busy === 'resolved'} disabled={busy !== null} onClick={() => void submit('resolved')}>
              {t('admin.reports.resolve')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-line-subtle pt-3 text-xs text-fg-muted">
          {t('admin.reports.handledBy', { name: r.resolvedBy?.displayName ?? '—', date: r.resolvedAt ? formatDateTime(r.resolvedAt) : '' })}
          {r.resolutionNote && <span className="mt-1 block text-fg-2">“{r.resolutionNote}”</span>}
        </p>
      )}
    </li>
  );
}

export function ReportsSection() {
  const [status, setStatus] = useState<Status>('open');
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ['admin', 'reports', status],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<{ reports: ReportDTO[] }>(`/api/admin/reports?status=${status}${pageParam ? `&before=${pageParam}` : ''}`).then((r) => r.reports),
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]?.createdAt : undefined),
  });
  const reports = list.data?.pages.flat() ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };
  return (
    <div className="flex flex-col gap-4">
      <Segmented<Status>
        label={t('admin.sections.reports')}
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: t('admin.reports.open') },
          { value: 'resolved', label: t('admin.reports.resolved') },
          { value: 'dismissed', label: t('admin.reports.dismissed') },
        ]}
        className="self-start"
      />
      {list.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState icon={Flag} title={t('admin.reports.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <ReportCard key={r.id} r={r} onDone={refresh} />
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <Button className="self-center" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {t('common.actions.loadMore')}
        </Button>
      )}
    </div>
  );
}
