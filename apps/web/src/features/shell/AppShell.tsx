import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useDesktop } from '../../stores/desktop';
import { MessageSkeleton } from '../../components/ui/skeleton';
import { VoiceDock, VoiceErrors } from '../voice/VoiceDock';
import { Gadgets } from './Gadgets';
import { MobileNav } from './MobileNav';
import { Taskbar } from './Taskbar';
import { VerifyBanner } from './VerifyBanner';
import { Wallpaper } from './Wallpaper';
import { AeroWindow } from './Window';

/** Conversations use the whole screen on mobile; everything else shows the bottom tab bar. */
function isConversation(path: string): boolean {
  return /^\/c\/[^/]+\/[^/]+/.test(path) || /^\/dm\/[^/]+/.test(path);
}

/**
 * Tablets and computers: a Vista desktop — the app in an Aero glass window over an animated
 * wallpaper, gadgets beside it on wide screens, the taskbar along the bottom.
 * Phones: the window's content fills the screen above a tab bar.
 */
export function AppShell() {
  const location = useLocation();
  const conversation = isConversation(location.pathname);
  const maximized = useDesktop((s) => s.maximized);
  const minimized = useDesktop((s) => s.minimized);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only z-[var(--z-toast)] rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <Wallpaper covered={maximized && !minimized} />
      <div
        className={cn(
          'flex min-h-0 flex-1',
          !conversation && 'pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))]',
          maximized ? 'md:p-0' : 'md:gap-[var(--desktop-gap)] md:p-[var(--desktop-gap)]',
        )}
      >
        <AeroWindow>
          <VerifyBanner />
          <VoiceDock />
          <VoiceErrors />
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
        </AeroWindow>
        {!maximized && <Gadgets />}
      </div>
      <Taskbar />
      {!conversation && <MobileNav />}
    </div>
  );
}
