import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface GlassWindowProps {
  /** Shown glowing on the glass (the page's own heading stays inside the window). */
  title: ReactNode;
  icon?: ReactNode;
  /** A control before the title, e.g. the round Back button of a wizard. */
  leading?: ReactNode;
  /** Something small on the right of the title bar, e.g. a step counter. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Slide in without fading, for a page whose heading must be painted at once (Welcome). */
  instant?: boolean;
}

/**
 * A glass window for the pages outside the chat (sign-in, welcome, onboarding): Aero glass
 * all around with the title on the glass and an opaque content area, like a Vista dialog. It has
 * no caption buttons — there is nothing to minimise or close on these pages.
 */
export function GlassWindow({
  title,
  icon,
  leading,
  aside,
  children,
  className,
  bodyClassName,
  instant,
}: GlassWindowProps) {
  return (
    <div
      className={cn('aero-dialog aero-glass glass-window flex flex-col', instant && 'glass-window-instant', className)}
    >
      <span aria-hidden className="glass-window-shine" />
      <div className="flex h-8 shrink-0 items-center gap-2 px-1">
        {leading}
        {icon && <span className="grid size-5 shrink-0 place-items-center">{icon}</span>}
        <p className="glass-text min-w-0 flex-1 truncate text-sm">{title}</p>
        {aside}
      </div>
      <div className={cn('aero-dialog-body', bodyClassName)}>{children}</div>
    </div>
  );
}
