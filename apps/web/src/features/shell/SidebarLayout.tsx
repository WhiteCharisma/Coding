import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useUi } from '../../stores/ui';
import { Sheet } from '../../components/ui/dialog';
import { ConnectionBanner } from './ConnectionBanner';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** On phones, show the sidebar as the page (index routes) or the content (conversation routes). */
  mobileView: 'sidebar' | 'content';
  contentLabel?: string;
}

/**
 * Desktop: [sidebar | content]. Phones: one of them full-screen; inside a
 * conversation the sidebar opens as a drawer (useUi.mobileSidebarOpen).
 */
export function SidebarLayout({ sidebar, children, mobileView, contentLabel }: SidebarLayoutProps) {
  const open = useUi((s) => s.mobileSidebarOpen);
  const setOpen = useUi((s) => s.setMobileSidebarOpen);
  return (
    <>
      <aside
        className={cn(
          'aero-navpane w-full shrink-0 flex-col md:flex md:w-[var(--sidebar-width)]',
          mobileView === 'sidebar' ? 'flex' : 'hidden',
        )}
      >
        {sidebar}
      </aside>
      <main
        id="main"
        aria-label={contentLabel}
        className={cn('min-w-0 flex-1 flex-col bg-main', mobileView === 'content' ? 'flex' : 'hidden md:flex')}
      >
        <ConnectionBanner />
        {children}
      </main>
      {mobileView === 'content' && (
        <Sheet open={open} onOpenChange={setOpen} side="left" title={t('shell.openSidebar')} className="md:hidden">
          <div
            className="flex h-full flex-col"
            onClickCapture={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}
          >
            {sidebar}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Full-width page (settings, search, notifications…). */
export function PageLayout({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <main id="main" aria-label={label} className={cn('flex min-w-0 flex-1 flex-col bg-main', className)}>
      <ConnectionBanner />
      {children}
    </main>
  );
}
