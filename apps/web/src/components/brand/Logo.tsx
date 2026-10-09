import { cn } from '../../lib/cn';

/** Brand mark: four level-meter bars — a nod to audio meters and to people standing together. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect x="5" y="13" width="3.6" height="7" rx="1.8" fill="currentColor" opacity="0.55" />
      <rect x="11" y="9" width="3.6" height="15" rx="1.8" fill="currentColor" opacity="0.8" />
      <rect x="17" y="5" width="3.6" height="22" rx="1.8" fill="currentColor" />
      <rect x="23" y="11" width="3.6" height="11" rx="1.8" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function Logo({ className, name = 'Creator Network' }: { className?: string; name?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-fg shadow-glow">
        <LogoMark className="size-6" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-fg">{name}</span>
    </span>
  );
}
