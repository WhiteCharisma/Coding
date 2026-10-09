import { AudioWaveform, Lock, MessagesSquare, UserRoundCheck } from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { useReduceMotion } from '../../lib/motion';
import { useSession } from '../../stores/session';
import { Logo } from '../../components/brand/Logo';
import { buttonVariants } from '../../components/ui/button';
import { MeterArt } from './AuthLayout';

const FEATURES = [
  { icon: MessagesSquare, title: 'auth.welcome.featureChatTitle', body: 'auth.welcome.featureChatBody' },
  { icon: UserRoundCheck, title: 'auth.welcome.featureProfileTitle', body: 'auth.welcome.featureProfileBody' },
  { icon: AudioWaveform, title: 'auth.welcome.featureAudioTitle', body: 'auth.welcome.featureAudioBody' },
  { icon: Lock, title: 'auth.welcome.featureOwnTitle', body: 'auth.welcome.featureOwnBody' },
] as const;

/** Decorative preview of the product (illustration only — not live data). */
function PreviewArt() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-10 bg-[radial-gradient(60%_60%_at_50%_40%,var(--accent-soft),transparent_70%)]" />
      <div className="relative rotate-[-2deg] rounded-2xl border border-line bg-elevated/90 p-4 shadow-lg">
        <div className="flex items-center gap-2 border-b border-line-subtle pb-3 text-sm text-fg-muted">
          <span className="font-mono text-accent-text">#</span> releases
        </div>
        <div className="mt-3 flex gap-3">
          <span className="size-9 shrink-0 rounded-full bg-gradient-to-br from-[oklch(0.62_0.12_40)] to-[oklch(0.42_0.1_320)]" />
          <div className="min-w-0 flex-1">
            <div className="h-3 w-24 rounded bg-fg/70" />
            <div className="mt-2 h-2.5 w-full rounded bg-fg-muted/40" />
            <div className="mt-1.5 h-2.5 w-2/3 rounded bg-fg-muted/40" />
            <div className="mt-3 rounded-xl border border-line bg-inset p-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg">▶</span>
                <MeterArt bars={34} className="h-9 flex-1" />
              </div>
            </div>
            <div className="mt-2 flex gap-1.5">
              <span className="rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-xs">🔥 5</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs">🎧 2</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative -mt-6 ml-auto w-3/4 rotate-[3deg] rounded-2xl border border-line bg-overlay p-3 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="size-7 rounded-full bg-gradient-to-br from-[oklch(0.6_0.1_190)] to-[oklch(0.4_0.08_240)]" />
          <div className="h-2.5 w-20 rounded bg-fg/60" />
        </div>
        <div className="mt-2 h-2.5 w-full rounded bg-fg-muted/40" />
        <div className="mt-1.5 h-2.5 w-1/2 rounded bg-fg-muted/40" />
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const config = useSession((s) => s.config);
  const reduce = useReduceMotion();
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  };
  // The headline is the page's largest element: it slides in but is never transparent,
  // so the browser can paint it (and count it as loaded) immediately.
  const headline = {
    hidden: { y: reduce ? 0 : 14 },
    show: { y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
  };
  const closed = config?.registrationMode === 'closed';
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-dvh bg-app">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo name={config?.instanceName ?? t('common.appName')} />
          <Link to="/login" className={buttonVariants({ variant: 'ghost' })}>
            {t('auth.welcome.ctaSecondary')}
          </Link>
        </header>
        <main
          id="main"
          className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-8 pb-20 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16"
        >
          <m.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.08 } } }}
          >
            <m.p variants={item} className="font-mono text-xs tracking-[0.16em] text-accent-text uppercase">
              {t('auth.welcome.eyebrow')}
            </m.p>
            <m.h1
              variants={headline}
              className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight text-fg text-balance sm:text-5xl lg:text-[3.5rem]"
            >
              {t('auth.welcome.title')}
            </m.h1>
            <m.p variants={item} className="mt-5 max-w-xl text-lg text-fg-2">
              {config?.welcomeMessage || t('auth.welcome.body')}
            </m.p>
            <m.div variants={item} className="mt-8 flex flex-wrap gap-3">
              {!closed && (
                <Link
                  to="/register"
                  className={buttonVariants({ variant: 'primary', size: 'lg' })}
                  data-testid="cta-register"
                >
                  {t('auth.welcome.ctaPrimary')}
                </Link>
              )}
              <Link to="/login" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
                {t('auth.welcome.ctaSecondary')}
              </Link>
            </m.div>
            <m.ul variants={item} className="mt-12 grid gap-5 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-elevated text-accent-text">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">{t(title)}</span>
                    <span className="mt-0.5 block text-sm text-fg-muted">{t(body)}</span>
                  </span>
                </li>
              ))}
            </m.ul>
          </m.div>
          <m.div
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            <PreviewArt />
          </m.div>
        </main>
      </div>
    </LazyMotion>
  );
}
