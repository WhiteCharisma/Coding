import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { GlassPane } from '../../components/ui/glass-pane';
import { MessageSkeleton } from '../../components/ui/skeleton';
import { VoiceDock, VoiceErrors } from '../voice/VoiceDock';
import { MobileNav } from './MobileNav';
import { Rail } from './Rail';
import { VerifyBanner } from './VerifyBanner';
import { Wallpaper } from './Wallpaper';

/** Conversations use the whole screen on mobile; everything else shows the bottom tab bar. */
function isConversation(path: string): boolean {
  return /^\/c\/[^/]+\/[^/]+/.test(path) || /^\/dm\/[^/]+/.test(path);
}

/** How long the rail and the panes take to rise into place when the app opens. */
const ENTER_MS = 900;

/**
 * Tablets and computers: the smoky-glass rail and the app's panes — each a small Aero window
 * with a glass header — floating over the animated scene. Phones: one pane fills the screen
 * above a tab bar.
 */
export function AppShell() {
  const location = useLocation();
  const conversation = isConversation(location.pathname);
  // The panes rise into place once, when the app opens (not on every page change).
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), ENTER_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      className="flex h-dvh overflow-hidden md:gap-[var(--pane-gap)] md:p-[var(--pane-gap)]"
      data-entering={entering || undefined}
    >
      <a
        href="#main"
        className="sr-only z-[var(--z-toast)] rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <Wallpaper />
      <Rail />
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col md:gap-[var(--pane-gap)]',
          !conversation && 'pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] md:pb-0',
        )}
      >
        <VerifyBanner />
        <VoiceDock />
        <VoiceErrors />
        <div className="flex min-h-0 flex-1 md:gap-[var(--pane-gap)]">
          <Suspense
            fallback={
              <GlassPane surface="main" className="flex-1">
                <div className="pane-head" />
                <MessageSkeleton />
              </GlassPane>
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
