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
}

export function Tooltip({ content, children, side = 'top', className, disabled }: TooltipProps) {
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
            'z-[var(--z-tooltip)] max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-xs font-medium text-main shadow-md data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-pop-in',
            className,
          )}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
