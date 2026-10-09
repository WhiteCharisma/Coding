import { Switch as S } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-ui text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </label>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line-strong bg-inset transition-colors duration-[var(--dur-fast)] data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <S.Thumb className="block size-4.5 translate-x-0.5 rounded-full bg-fg-2 shadow-sm transition-transform duration-[var(--dur-base)] ease-spring data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-fg" />
      </S.Root>
    </div>
  );
}
