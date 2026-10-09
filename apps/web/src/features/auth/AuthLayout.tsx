import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { useSession } from '../../stores/session';
import { Logo } from '../../components/brand/Logo';
import { SkyArt } from '../../components/brand/SkyArt';

/** Decorative level-meter bars (static: decoration never animates in a loop). */
export function MeterArt({ bars = 28, className }: { bars?: number; className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="flex h-full items-end gap-[3px]">
        {Array.from({ length: bars }, (_, i) => {
          const h = 18 + Math.abs(Math.sin(i * 1.7) * 60) + (i % 5) * 4;
          return (
            <span
              key={i}
              className="w-full rounded-full bg-linear-to-t from-aqua/40 via-accent/80 to-accent-hi"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Sign-in, sign-up and recovery pages: a glass window floating in the sky. */
export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const config = useSession((s) => s.config);
  return (
    <div className="relative flex min-h-dvh flex-col">
      <SkyArt />
      <header className="relative mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <Link to="/welcome" className="glass inline-flex rounded-2xl bg-elevated px-3 py-2">
          <Logo name={config?.instanceName ?? t('common.appName')} />
        </Link>
      </header>
      <main
        id="main"
        className="relative flex flex-1 items-start justify-center px-4 pt-6 pb-10 sm:items-center sm:pt-2"
      >
        <div className="glass w-full max-w-[27rem] overflow-hidden rounded-3xl bg-overlay animate-rise-in">
          <div className="titlebar px-6 pt-6 pb-5 sm:px-8 sm:pt-7">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fg text-balance sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1.5 text-fg-muted">{subtitle}</p>}
          </div>
          <div className="px-6 pt-5 pb-7 sm:px-8">{children}</div>
        </div>
      </main>
      <footer className="relative flex justify-center px-4 pb-6">
        <p className="glass rounded-full bg-elevated px-4 py-1.5 text-center text-sm font-medium text-fg-2 text-balance">
          {t('common.tagline')}
        </p>
      </footer>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}
