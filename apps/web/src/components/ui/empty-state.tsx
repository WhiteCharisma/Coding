import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  className?: string;
  tone?: 'default' | 'danger';
}

export function EmptyState({ icon: Icon, title, body, actions, className, tone = 'default' }: EmptyStateProps) {
  return (
    <div className={cn('mx-auto flex max-w-sm flex-col items-center px-6 py-12 text-center animate-rise-in', className)}>
      {Icon && (
        <div className={cn('mb-4 grid size-12 place-items-center rounded-xl border', tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-elevated text-accent-text')}>
          <Icon className="size-5" />
        </div>
      )}
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg text-balance">{title}</h2>
      {body && <p className="mt-1.5 text-sm text-fg-muted text-balance">{body}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
