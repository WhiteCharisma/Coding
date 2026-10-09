import { DISCIPLINES, LIMITS, type Discipline } from '@creator-network/shared';
import { Check } from 'lucide-react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';

/** Multi-select chip list for creative disciplines (max LIMITS.disciplinesMax). */
export function DisciplinePicker({ value, onChange, label }: { value: Discipline[]; onChange: (v: Discipline[]) => void; label: string }) {
  const full = value.length >= LIMITS.disciplinesMax;
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {DISCIPLINES.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-[background-color,border-color,color] duration-[var(--dur-fast)] disabled:opacity-40',
                on ? 'border-accent-border bg-accent-soft text-accent-text' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg',
              )}
            >
              {on && <Check className="size-3.5" />}
              {t(`common.disciplines.${d}`)}
            </button>
          );
        })}
      </div>
      <p className="mt-3 font-mono text-xs text-fg-muted" aria-live="polite">
        {value.length}/{LIMITS.disciplinesMax}
      </p>
    </fieldset>
  );
}
