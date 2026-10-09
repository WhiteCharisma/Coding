import { Check, ChevronRight } from 'lucide-react';
import { DropdownMenu as M } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;
export const MenuSub = M.Sub;
export const MenuRadioGroup = M.RadioGroup;

const surface =
  'z-[var(--z-popover)] min-w-[12rem] overflow-hidden rounded-lg border border-line bg-overlay p-1 text-fg shadow-lg data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in';

export function MenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset} collisionPadding={8} className={cn(surface, className)} {...props} />
    </M.Portal>
  );
}

const itemBase =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-ui text-fg-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-active data-[highlighted]:text-fg [&_svg]:size-4 [&_svg]:text-fg-muted data-[highlighted]:[&_svg]:text-fg';

export function MenuItem({ className, danger, ...props }: ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(itemBase, danger && 'text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger [&_svg]:text-danger data-[highlighted]:[&_svg]:text-danger', className)} {...props} />;
}

export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(itemBase, 'pr-8', className)} {...props}>
      {children}
      <M.ItemIndicator className="absolute right-2">
        <Check className="size-4 text-accent-text" />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}

export function MenuSubTrigger({ className, children, ...props }: ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger className={cn(itemBase, 'data-[state=open]:bg-active', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubTrigger>
  );
}

export function MenuSubContent({ className, ...props }: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} collisionPadding={8} className={cn(surface, className)} {...props} />
    </M.Portal>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <M.Separator className={cn('my-1 h-px bg-line-subtle', className)} />;
}

export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <M.Label className={cn('px-2.5 pt-1.5 pb-1 text-2xs font-semibold tracking-wide text-fg-muted uppercase', className)}>{children}</M.Label>;
}
