import { Tabs as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-line-subtle', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'relative shrink-0 px-3 pt-2 pb-2.5 text-ui font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:text-fg',
        'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}
