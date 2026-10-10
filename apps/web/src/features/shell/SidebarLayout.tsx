import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useUi } from '../../stores/ui';
import { Sheet } from '../../components/ui/dialog';
import { GlassPane } from '../../components/ui/glass-pane';
import { ConnectionBanner } from './ConnectionBanner';

/** The glass header of a pane that has none of its own: the place's name, glowing on the glass. */
export function PaneTitle({ title, icon }: { title?: string; icon?: ReactNode }) {
  return (
    <div className="pane-head max-md:hidden">
      {icon}
      {title && <p className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{title}</p>}
    </div>
  );
}

interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** On phones, show the sidebar as the page (index routes) or the content (conversation routes). */
  mobileView: 'sidebar' | 'content';
  contentLabel?: string;
  /** The conversation's own header (it sits on the glass); otherwise `contentLabel` is shown there. */
  header?: ReactNode;
  /** A pane on the right of the content (members, pins) on wide screens. */
  aside?: ReactNode;
}

/**
 * Desktop: [sidebar | content | aside], each a glass pane. Phones: one of them full-screen;
 * inside a conversation the sidebar opens as a drawer (useUi.mobileSidebarOpen).
 */
export function SidebarLayout({ sidebar, children, mobileView, contentLabel, header, aside }: SidebarLayoutProps) {
  const open = useUi((s) => s.mobileSidebarOpen);
  const setOpen = useUi((s) => s.setMobileSidebarOpen);
  return (
    <>
      <GlassPane
        as="aside"
        className={cn(
          'w-full shrink-0 md:flex md:w-[var(--sidebar-width)]',
          mobileView === 'sidebar' ? 'flex' : 'hidden',
        )}
      >
        {sidebar}
      </GlassPane>
      <GlassPane
        as="main"
        surface="main"
        id="main"
        aria-label={contentLabel}
        shine={contentLabel ?? ''}
        className={cn('min-w-0 flex-1', mobileView === 'content' ? 'flex' : 'hidden md:flex')}
      >
        {header ?? <PaneTitle title={contentLabel} />}
        <ConnectionBanner />
        {children}
      </GlassPane>
      {aside}
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

/** Full-width page (settings, search, notifications…): one glass pane with the page's name on top. */
export function PageLayout({
  children,
  label,
  icon,
  className,
}: {
  children: ReactNode;
  label?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <GlassPane
      as="main"
      surface="main"
      id="main"
      aria-label={label}
      shine={label ?? ''}
      className={cn('min-w-0 flex-1', className)}
    >
      <PaneTitle title={label} icon={icon} />
      <ConnectionBanner />
      {children}
    </GlassPane>
  );
}
