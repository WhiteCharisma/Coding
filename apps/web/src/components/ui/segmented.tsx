import { cn } from '../../lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

/** Accessible single-choice control (radio group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-xl border border-line bg-inset p-1 shadow-[inset_0_1px_2px_var(--border-subtle)]', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-[var(--dur-fast)]',
            value === o.value
              ? 'gloss border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-accent-fg shadow-sm'
              : 'border border-transparent text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
