import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';

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

/** Centered modal on desktop; anchored to the bottom like a sheet on small screens. */
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
          'glass fixed z-[var(--z-modal)] flex max-h-[min(90dvh,860px)] w-full flex-col overflow-hidden bg-overlay text-fg shadow-lg focus:outline-none',
          'inset-x-0 bottom-0 rounded-t-2xl data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in',
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=closed]:animate-pop-out sm:data-[state=open]:animate-pop-in',
          sizes[size],
          className,
        )}
      >
        <div className={cn('titlebar flex items-start gap-4 px-5 pt-4 pb-3', hideTitle && 'sr-only')}>
          <div className="min-w-0 flex-1">
            <D.Title className="font-display text-xl font-semibold text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="-mt-1 -mr-1 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            aria-label={t('common.actions.close')}
          >
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="scroll-area min-h-0 flex-1 px-5 pt-3 pb-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-inset/60 px-5 py-3 safe-bottom">
            {footer}
          </div>
        )}
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
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
