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
        className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-inset shadow-[inset_0_1px_3px_var(--border)] transition-[background-color,border-color] duration-[var(--dur-fast)] data-[state=checked]:border-accent-border data-[state=checked]:bg-linear-to-b data-[state=checked]:from-accent-lo data-[state=checked]:to-accent-hi disabled:opacity-50"
      >
        {/* A pearl knob: the same in both themes, outlined so it stands out on the light track. */}
        <S.Thumb className="block size-5 translate-x-0.5 rounded-full border border-line-strong bg-[radial-gradient(circle_at_35%_30%,var(--knob-hi),var(--knob)_60%)] shadow-md transition-transform duration-[var(--dur-base)] ease-spring data-[state=checked]:translate-x-[20px]" />
      </S.Root>
    </div>
  );
}
