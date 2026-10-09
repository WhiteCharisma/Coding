import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { MessageSkeleton } from '../../components/ui/skeleton';
import { MobileNav } from './MobileNav';
import { NavRail } from './NavRail';
import { VerifyBanner } from './VerifyBanner';

/** Conversations use the whole screen on mobile; everything else shows the bottom tab bar. */
function isConversation(path: string): boolean {
  return /^\/c\/[^/]+\/[^/]+/.test(path) || /^\/dm\/[^/]+/.test(path);
}

export function AppShell() {
  const location = useLocation();
  const conversation = isConversation(location.pathname);
  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <a
        href="#main"
        className="sr-only z-[var(--z-toast)] rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <NavRail />
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          !conversation && 'pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] md:pb-0',
        )}
      >
        <VerifyBanner />
        <div className="flex min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="flex-1 bg-main">
                <MessageSkeleton />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
      {!conversation && <MobileNav />}
    </div>
  );
}
