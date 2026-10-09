import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

const tones = {
  accent:
    'border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-accent-fg shadow-[0_6px_16px_-8px_var(--accent-glow)]',
  neutral: 'border-glass-edge bg-elevated text-fg-2 shadow-sm',
  success: 'border-success/30 bg-success-soft text-success',
  danger: 'border-danger/30 bg-danger-soft text-danger',
};

const sizes = {
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-10 [&_svg]:size-5',
  lg: 'size-14 [&_svg]:size-6',
  xl: 'size-16 [&_svg]:size-7',
};

/** A glossy round bubble holding an icon: the Aero way to mark a place, a feature or a state. */
export function Orb({
  icon: Icon,
  size = 'md',
  tone = 'accent',
  className,
}: {
  icon: LucideIcon;
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('gloss grid shrink-0 place-items-center rounded-full border', sizes[size], tones[tone], className)}
    >
      <Icon />
    </span>
  );
}
