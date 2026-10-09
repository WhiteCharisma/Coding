import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useSession } from '../../stores/session';
import { CountBadge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';
import { PageLayout, SidebarLayout } from '../shell/SidebarLayout';
import { useIsDesktop } from '../shell/hooks';
import { OverviewSection, type AdminOverview } from './OverviewSection';
import { ReportsSection } from './ReportsSection';
import { UsersSection } from './UsersSection';
import {
  AuditSection,
  BackupsSection,
  CommunitiesSection,
  InstanceSettingsSection,
  InvitesSection,
} from './OtherSections';
import { ADMIN_SECTIONS } from './sections';

const SECTIONS = ADMIN_SECTIONS;
type SectionKey = (typeof SECTIONS)[number]['key'];

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get<AdminOverview>('/api/admin/overview'),
    refetchInterval: 30_000,
  });
}

export default function AdminPage() {
  const { section } = useParams();
  const user = useSession((s) => s.user);
  const isAdmin = user?.platformRole === 'admin';
  const isStaff = !!user && user.platformRole !== 'member';
  const overview = useAdminOverview();
  // On phones the list is its own page: nothing is "current" there until a section opens.
  const showCurrent = useIsDesktop() || !!section;
  if (!user) return null;
  if (!isStaff) {
    return (
      <PageLayout>
        <div className="grid flex-1 place-items-center">
          <EmptyState
            icon={ShieldAlert}
            tone="danger"
            title={t('common.errors.notFoundTitle')}
            body={t('admin.forbidden')}
          />
        </div>
      </PageLayout>
    );
  }
  const visible = SECTIONS.filter((s) => isAdmin || !s.adminOnly);
  const match = visible.find((s) => s.key === section);
  if (section && !match) return <Navigate to="/admin" replace />;
  const active: SectionKey = match?.key ?? 'overview';
  const openReports = overview.data?.counts.openReports ?? 0;

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="titlebar flex h-[var(--header-height)] shrink-0 items-center px-4">
        <h1 className="font-display text-[15px] font-semibold tracking-tight text-fg">{t('admin.title')}</h1>
      </div>
      <nav aria-label={t('admin.title')} className="scroll-area min-h-0 flex-1 p-2">
        <ul className="flex flex-col gap-px">
          {visible.map(({ key, icon: Icon }) => (
            <li key={key}>
              <Link
                to={`/admin/${key}`}
                aria-current={showCurrent && active === key ? 'page' : undefined}
                className="aero-item flex h-10 items-center gap-3 rounded-lg px-3 text-ui text-fg-2 hover:text-fg md:h-9"
              >
                <Icon className={cn('size-4', showCurrent && active === key ? 'text-accent-text' : 'text-fg-muted')} />
                <span className="flex-1">{t(`admin.sections.${key}`)}</span>
                {key === 'reports' && openReports > 0 && <CountBadge count={openReports} tone="danger" />}
                <ChevronRight className="size-4 text-fg-faint md:hidden" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );

  return (
    <SidebarLayout
      sidebar={sidebar}
      mobileView={section ? 'content' : 'sidebar'}
      contentLabel={t(`admin.sections.${active}`)}
    >
      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-4xl px-4 pt-4 pb-16 md:px-8 md:pt-10">
          <Link
            to="/admin"
            className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg md:hidden"
          >
            <ChevronLeft className="size-4" /> {t('admin.title')}
          </Link>
          <div key={active} className="animate-rise-in">
            <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-fg">
              {t(`admin.sections.${active}`)}
            </h1>
            {active === 'overview' && <OverviewSection query={overview} />}
            {active === 'reports' && <ReportsSection />}
            {active === 'users' && <UsersSection isAdmin={isAdmin} selfId={user.id} />}
            {active === 'communities' && <CommunitiesSection isAdmin={isAdmin} />}
            {active === 'invites' && <InvitesSection />}
            {active === 'settings' && <InstanceSettingsSection />}
            {active === 'backups' && <BackupsSection overview={overview.data} />}
            {active === 'audit' && <AuditSection />}
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
