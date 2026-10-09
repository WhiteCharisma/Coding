import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useDesktop } from '../../stores/desktop';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideTitle?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

/**
 * Counts this modal as open while it is on screen: the wallpaper rests behind it, so its
 * blurred backdrop is not redrawn for every frame of the animation.
 */
function ModalPresence() {
  useEffect(() => {
    useDesktop.getState().modalOpened();
    return () => useDesktop.getState().modalClosed();
  }, []);
  return null;
}

/**
 * A dialog is a small Vista window: Aero glass frame with its title glowing on the glass, the red
 * close button hanging from the top edge, and an opaque content area. Centered on desktop;
 * anchored to the bottom like a sheet on small screens (clear of the home indicator).
 */
export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  size = 'md',
  hideTitle,
  onOpenAutoFocus,
}: DialogContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-scrim backdrop-blur-[3px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <D.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'aero-dialog aero-glass fixed z-[var(--z-modal)] flex max-h-[min(90dvh,860px)] w-full flex-col text-fg focus:outline-none',
          'inset-x-0 bottom-0 rounded-b-none pb-[max(7px,env(safe-area-inset-bottom))] data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in',
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[9px] sm:pb-[7px] sm:data-[state=closed]:animate-pop-out sm:data-[state=open]:animate-pop-in',
          sizes[size],
          className,
        )}
      >
        <ModalPresence />
        <div className="flex h-8 shrink-0 items-center pr-14 pl-2">
          <D.Title className={cn('glass-text truncate text-sm', hideTitle && 'sr-only')}>{title}</D.Title>
        </div>
        <div className="aero-dialog-body">
          {description ? (
            <D.Description className="px-5 pt-4 text-sm text-fg-muted">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
          <div className="scroll-area min-h-0 flex-1 px-5 pt-4 pb-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-inset px-5 py-3">
              {footer}
            </div>
          )}
        </div>
        {/* After the content so that opening the dialog focuses its first field, not "Close". */}
        <D.Close className="caption-btn caption-close absolute top-0 right-2" aria-label={t('common.actions.close')}>
          <X />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'left' | 'right' | 'bottom';
  title: string;
  children: ReactNode;
  className?: string;
}

/** Off-canvas drawer used for mobile navigation and side panels. */
export function Sheet({ open, onOpenChange, side = 'left', title, children, className }: SheetProps) {
  const position = {
    left: 'inset-y-0 left-0 h-full w-[min(88vw,var(--sidebar-width))] data-[state=open]:animate-drawer-in-left data-[state=closed]:animate-drawer-out-left',
    right:
      'inset-y-0 right-0 h-full w-[min(92vw,360px)] data-[state=open]:animate-drawer-in-right data-[state=closed]:animate-drawer-out-right',
    bottom:
      'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out',
  }[side];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[var(--z-drawer)] bg-scrim backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            'glass fixed z-[var(--z-drawer)] flex flex-col overflow-hidden bg-overlay focus:outline-none',
            position,
            className,
          )}
        >
          <ModalPresence />
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
