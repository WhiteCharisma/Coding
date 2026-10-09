import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { useSession } from '../../stores/session';
import { Logo } from '../../components/brand/Logo';

/** Decorative level-meter bars (pure CSS, paused when reduced motion is requested). */
export function MeterArt({ bars = 28, className }: { bars?: number; className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="flex h-full items-end gap-[3px]">
        {Array.from({ length: bars }, (_, i) => {
          const h = 18 + Math.abs(Math.sin(i * 1.7) * 60) + (i % 5) * 4;
          return (
            <span
              key={i}
              className="w-full origin-bottom rounded-full bg-gradient-to-t from-accent/25 via-accent/70 to-accent motion-safe:animate-[meter_2.4s_ease-in-out_infinite]"
              style={{ height: `${h}%`, animationDelay: `${(i % 7) * 140}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const config = useSession((s) => s.config);
  return (
    <div className="flex min-h-dvh bg-app">
      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-10">
        <Link to="/welcome" className="w-fit">
          <Logo name={config?.instanceName ?? t('common.appName')} />
        </Link>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-rise-in">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-fg text-balance">{title}</h1>
            {subtitle && <p className="mt-2 text-fg-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
      <aside className="relative hidden w-[44%] max-w-2xl overflow-hidden border-l border-line-subtle bg-sidebar lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,var(--accent-soft),transparent_70%)]" />
        <div className="absolute inset-x-12 bottom-24 top-1/3">
          <MeterArt className="h-full opacity-80" />
        </div>
        <div className="absolute inset-x-12 bottom-10">
          <p className="font-display text-xl font-medium tracking-tight text-fg-2 text-balance">{t('common.tagline')}</p>
        </div>
      </aside>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}
