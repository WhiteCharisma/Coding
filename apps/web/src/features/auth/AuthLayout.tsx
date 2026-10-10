import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { useSession } from '../../stores/session';
import { Logo, LogoMark } from '../../components/brand/Logo';
import { GlassWindow } from '../../components/ui/glass-window';
import { PublicBackdrop } from '../shell/Wallpaper';

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

/** Sign-in, sign-up and recovery pages: a Vista window on the desktop. */
export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const config = useSession((s) => s.config);
  const name = config?.instanceName ?? t('common.appName');
  return (
    <div className="relative flex min-h-dvh flex-col">
      <PublicBackdrop />
      <header className="relative mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <Link to="/welcome" className="aero-glass glass-chip inline-flex px-3 py-1.5">
          <Logo name={name} />
        </Link>
      </header>
      <main
        id="main"
        className="relative flex flex-1 items-start justify-center px-4 pt-6 pb-10 sm:items-center sm:pt-2"
      >
        <GlassWindow title={name} icon={<LogoMark className="size-4" />} className="w-full max-w-[27rem]">
          <div className="titlebar px-6 pt-5 pb-4 sm:px-8 sm:pt-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fg text-balance sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1.5 text-fg-muted">{subtitle}</p>}
          </div>
          <div className="px-6 pt-5 pb-7 sm:px-8">{children}</div>
        </GlassWindow>
      </main>
      <footer className="relative flex justify-center px-4 pb-6">
        <p className="aero-glass glass-chip glass-text px-4 py-1.5 text-center text-sm font-medium text-balance">
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
