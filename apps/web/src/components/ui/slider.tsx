import { Slider as S } from 'radix-ui';
import { cn } from '../../lib/cn';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  /** Called when the person lets go (e.g. to play a preview at the final value). */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** Read out by screen readers, e.g. "60 %". */
  valueText?: string;
  disabled?: boolean;
  className?: string;
}

/** Aero slider: a sunken glass track, a glossy sky-blue fill and a pearl knob. */
export function Slider({
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueText,
  disabled,
  className,
}: SliderProps) {
  return (
    <S.Root
      value={[value]}
      onValueChange={([v]) => v !== undefined && onValueChange(v)}
      onValueCommit={([v]) => v !== undefined && onValueCommit?.(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn(
        'relative flex h-6 w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
    >
      <S.Track className="relative h-2 grow overflow-hidden rounded-full border border-line-strong bg-inset shadow-[inset_0_1px_3px_var(--border)]">
        <S.Range className="absolute h-full rounded-full bg-linear-to-b from-accent-hi to-accent-lo" />
      </S.Track>
      <S.Thumb
        aria-label={label}
        aria-valuetext={valueText}
        className="block size-5 rounded-full border border-line-strong bg-[radial-gradient(circle_at_35%_30%,var(--knob-hi),var(--knob)_60%)] shadow-md transition-transform duration-[var(--dur-fast)] hover:scale-110 active:scale-95"
      />
    </S.Root>
  );
}
