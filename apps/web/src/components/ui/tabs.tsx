import { Tabs as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn('flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-line-subtle', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        // The list scrolls sideways, which would clip an outer focus ring: draw it inside.
        'relative shrink-0 rounded-lg px-3 pt-2 pb-2.5 text-ui font-semibold text-fg-muted transition-colors hover:text-fg focus-visible:-outline-offset-2 focus-visible:shadow-none data-[state=active]:text-accent-text',
        'after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-linear-to-r after:from-aqua after:to-accent-lo after:opacity-0 after:shadow-[0_0_8px_var(--accent-glow)] after:transition-opacity data-[state=active]:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}
