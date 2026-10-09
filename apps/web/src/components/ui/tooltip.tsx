import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const TooltipProvider = T.Provider;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  /** Tooltips repeat visible labels for mouse users; keep essential info visible elsewhere for touch. */
  disabled?: boolean;
  /** "thumbnail": the black-glass preview card shown over taskbar buttons. */
  variant?: 'label' | 'thumbnail';
}

export function Tooltip({ content, children, side = 'top', className, disabled, variant = 'label' }: TooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className={cn(
            'z-[var(--z-tooltip)] data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-pop-in',
            variant === 'thumbnail'
              ? 'taskbar-thumb taskbar-glass p-2'
              : 'aero-tooltip max-w-xs px-2 py-1 text-xs text-fg',
            className,
          )}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
