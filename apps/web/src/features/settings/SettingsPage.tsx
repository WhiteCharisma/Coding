import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  ShieldHalf,
  UserRound,
  UserRoundCog,
} from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useSession } from '../../stores/session';
import { SidebarLayout } from '../shell/SidebarLayout';
import { AccountSection, SessionsSection } from './AccountSection';
import { AppearanceSection, NotificationsSection, PrivacySection } from './PreferenceSections';
import { ProfileSection } from './ProfileSection';

const SECTIONS = [
  { key: 'profile', icon: UserRound },
  { key: 'account', icon: UserRoundCog },
  { key: 'sessions', icon: MonitorSmartphone },
  { key: 'notifications', icon: Bell },
  { key: 'appearance', icon: Palette },
  { key: 'privacy', icon: ShieldHalf },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

function isSection(v: string | undefined): v is SectionKey {
  return SECTIONS.some((s) => s.key === v);
}

export default function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  if (!user) return null;
  if (section && !isSection(section)) return <Navigate to="/settings" replace />;
  const active: SectionKey = isSection(section) ? section : 'profile';

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--header-height)] shrink-0 items-center border-b border-line-subtle px-4">
        <h1 className="font-display text-[15px] font-semibold tracking-tight text-fg">{t('settings.title')}</h1>
      </div>
      <nav aria-label={t('settings.title')} className="scroll-area min-h-0 flex-1 p-2">
        <ul className="flex flex-col gap-px">
          {SECTIONS.map(({ key, icon: Icon }) => {
            return (
              <li key={key}>
                <Link
                  to={`/settings/${key}`}
                  aria-current={active === key ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-md px-3 text-ui transition-colors duration-[var(--dur-fast)] md:h-9',
                    active === key ? 'text-fg md:bg-selected' : 'text-fg-2 hover:bg-hover hover:text-fg',
                  )}
                >
                  <Icon className="size-4 text-fg-muted" />
                  <span className="flex-1">{t(`settings.sections.${key}`)}</span>
                  <ChevronRight className="size-4 text-fg-faint md:hidden" />
                </Link>
              </li>
            );
          })}
          {user.platformRole !== 'member' && (
            <li className="mt-2 border-t border-line-subtle pt-2">
              <Link
                to="/admin"
                className="flex h-10 items-center gap-3 rounded-md px-3 text-ui text-fg-2 transition-colors hover:bg-hover hover:text-fg md:h-9"
              >
                <ShieldCheck className="size-4 text-accent-text" />
                <span className="flex-1">{t('admin.title')}</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>
      <div className="border-t border-line-subtle p-2">
        <button
          type="button"
          onClick={() =>
            void useSession
              .getState()
              .logout()
              .then(() => navigate('/welcome', { replace: true }))
          }
          className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-ui text-danger transition-colors hover:bg-danger-soft md:h-9"
        >
          <LogOut className="size-4" /> {t('shell.userMenu.signOut')}
        </button>
      </div>
    </div>
  );

  return (
    <SidebarLayout
      sidebar={sidebar}
      mobileView={section ? 'content' : 'sidebar'}
      contentLabel={t(`settings.sections.${active}`)}
    >
      <div className="scroll-area flex-1">
        <div className="mx-auto max-w-2xl px-4 pt-4 pb-16 md:px-8 md:pt-10">
          <Link
            to="/settings"
            className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg md:hidden"
          >
            <ChevronLeft className="size-4" /> {t('settings.title')}
          </Link>
          <div key={active} className="animate-rise-in">
            {active === 'profile' && <ProfileSection user={user} />}
            {active === 'account' && <AccountSection user={user} />}
            {active === 'sessions' && <SessionsSection />}
            {active === 'notifications' && <NotificationsSection user={user} />}
            {active === 'appearance' && <AppearanceSection />}
            {active === 'privacy' && <PrivacySection user={user} />}
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
