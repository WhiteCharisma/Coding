import { Popover as P } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        collisionPadding={10}
        className={cn(
          'glass z-[var(--z-popover)] origin-(--radix-popover-content-transform-origin) rounded-2xl bg-overlay text-fg outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
