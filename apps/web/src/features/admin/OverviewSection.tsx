import type { UseQueryResult } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { t, tMaybe } from '../../i18n';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatBytes, formatDateTime } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

export interface AdminOverview {
  health: {
    status: 'ok' | 'degraded';
    version: string;
    uptimeSeconds: number;
    checks: Record<string, { ok: boolean; detail?: string }>;
  };
  counts: {
    users: number;
    suspendedUsers: number;
    communities: number;
    messages: number;
    messages24h: number;
    activeSessions: number;
    openReports: number;
    uploadsBytes: number;
  };
  runtime: {
    connectedSockets: number;
    voicePeers: number;
    rssMb: number;
    heapUsedMb: number;
    nodeVersion: string;
    databaseBytes: number;
  };
  email: { transport: 'smtp' | 'outbox' | 'disabled'; enabled: boolean };
  backups: { latest: { file: string; bytes: number; createdAt: number } | null; intervalHours: number };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'danger';
}) {
  return (
    <div className="tile p-4">
      <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</p>
      <p
        className={cn(
          'mt-1.5 font-display text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'danger' ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-fg-muted">{detail}</p>}
    </div>
  );
}

export function OverviewSection({ query }: { query: UseQueryResult<AdminOverview> }) {
  const o = query.data;
  if (query.isError) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
        role="alert"
      >
        {errorMessage(query.error)}
        <Button size="sm" onClick={() => void query.refetch()}>
          <RotateCcw /> {t('common.actions.retry')}
        </Button>
      </div>
    );
  }
  if (!o) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  const healthy = o.health.status === 'ok';
  const nf = new Intl.NumberFormat();
  return (
    <div className="flex flex-col gap-6" data-testid="admin-overview">
      <section
        className={cn(
          'rounded-xl border p-4',
          healthy ? 'border-success/30 bg-success-soft/50' : 'border-warning/40 bg-warning-soft',
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          {healthy ? <CheckCircle2 className="size-5 text-success" /> : <CircleAlert className="size-5 text-warning" />}
          <h2 className="font-semibold text-fg">
            {healthy ? t('admin.overview.healthy') : t('admin.overview.degraded')}
          </h2>
          <span className="ml-auto font-mono text-xs text-fg-muted">
            {t('admin.overview.version')} {o.health.version} · {t('admin.overview.uptime')}{' '}
            {formatUptime(o.health.uptimeSeconds)} · {t('admin.overview.node')} {o.runtime.nodeVersion}
          </span>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {Object.entries(o.health.checks).map(([name, c]) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span className={cn('size-2 rounded-full', c.ok ? 'bg-success' : 'bg-danger')} aria-hidden />
              <span className="text-fg-2">{tMaybe(`admin.overview.checks.${name}`) ?? name}</span>
              {c.detail && <span className="truncate text-xs text-fg-muted">{c.detail}</span>}
            </li>
          ))}
        </ul>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('admin.overview.users')}
          value={nf.format(o.counts.users)}
          detail={
            o.counts.suspendedUsers > 0 ? t('admin.overview.suspended', { count: o.counts.suspendedUsers }) : undefined
          }
        />
        <Stat label={t('admin.overview.communities')} value={nf.format(o.counts.communities)} />
        <Stat
          label={t('admin.overview.messages')}
          value={nf.format(o.counts.messages)}
          detail={`${t('admin.overview.messages24h')}: ${nf.format(o.counts.messages24h)}`}
        />
        <Stat
          label={t('admin.overview.openReports')}
          value={nf.format(o.counts.openReports)}
          tone={o.counts.openReports > 0 ? 'danger' : undefined}
        />
        <Stat label={t('admin.overview.sessions')} value={nf.format(o.counts.activeSessions)} />
        <Stat
          label={t('admin.overview.sockets')}
          value={nf.format(o.runtime.connectedSockets)}
          detail={t('admin.overview.inVoice', { count: o.runtime.voicePeers })}
        />
        <Stat
          label={t('admin.overview.storage')}
          value={formatBytes(o.counts.uploadsBytes)}
          detail={`${t('admin.overview.database')}: ${formatBytes(o.runtime.databaseBytes)}`}
        />
        <Stat
          label={t('admin.overview.memory')}
          value={`${o.runtime.rssMb} MB`}
          detail={t('admin.overview.memoryDetail', { heap: o.runtime.heapUsedMb })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="tile p-4">
          <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{t('admin.overview.email')}</p>
          <p className={cn('mt-1.5 text-sm', o.email.transport === 'smtp' ? 'text-fg' : 'text-warning')}>
            {o.email.transport === 'smtp'
              ? t('admin.overview.emailSmtp')
              : o.email.transport === 'outbox'
                ? t('admin.overview.emailOutbox')
                : t('admin.overview.emailDisabled')}
          </p>
        </div>
        <div className="tile p-4">
          <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{t('admin.overview.lastBackup')}</p>
          <p className={cn('mt-1.5 text-sm', o.backups.latest ? 'text-fg' : 'text-warning')}>
            {o.backups.latest
              ? `${formatDateTime(o.backups.latest.createdAt)} · ${formatBytes(o.backups.latest.bytes)}`
              : t('admin.overview.noBackup')}
          </p>
        </div>
      </div>
    </div>
  );
}
