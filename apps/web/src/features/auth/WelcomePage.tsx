import { AudioWaveform, Lock, MessagesSquare, UserRoundCheck } from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { useReduceMotion } from '../../lib/motion';
import { useSession } from '../../stores/session';
import { LogoMark } from '../../components/brand/Logo';
import { buttonVariants } from '../../components/ui/button';
import { GlassWindow } from '../../components/ui/glass-window';
import { Orb } from '../../components/ui/orb';
import { PublicBackdrop } from '../shell/Wallpaper';
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
    <div aria-hidden className="relative h-full min-h-[26rem] overflow-hidden">
      {/* A small piece of sky behind the windows. */}
      <div className="absolute inset-0 bg-linear-to-b from-sky-2 via-sky-3 to-sky-4" />
      <div className="absolute -top-16 -right-10 size-64 rounded-full bg-[radial-gradient(circle,var(--sun),transparent_65%)] opacity-90" />
      <span className="bubble absolute top-[14%] left-[10%] size-12" />
      <span className="bubble absolute top-[70%] right-[8%] size-16" />
      <span className="bubble absolute top-[8%] right-[30%] size-6" />
      <div className="relative mx-auto mt-14 w-[82%] max-w-sm">
        <div className="aero-glass relative rotate-[-2deg] rounded-[9px] px-1.5 pb-1.5 shadow-[0_0_0_1px_var(--frame-edge),inset_0_1px_0_var(--frame-highlight),var(--shadow-lg)]">
          <div className="glass-text flex items-center gap-2 px-1 py-1.5 text-xs">
            <span className="gloss grid size-5 place-items-center rounded-full border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-[10px] text-accent-fg">
              #
            </span>
            releases
          </div>
          <div className="flex gap-3 rounded-[2px] bg-main p-4 shadow-[0_0_0_1px_var(--frame-edge)]">
            <span className="avatar-frame size-9 shrink-0 rounded-avatar bg-linear-to-br from-[oklch(0.72_0.12_40)] to-[oklch(0.45_0.11_320)]" />
            <div className="min-w-0 flex-1">
              <div className="h-3 w-24 rounded-full bg-fg/60" />
              <div className="mt-2 h-2.5 w-full rounded-full bg-fg-muted/35" />
              <div className="mt-1.5 h-2.5 w-2/3 rounded-full bg-fg-muted/35" />
              <div className="mt-3 rounded-xl border border-glass-edge bg-inset p-2.5 shadow-[inset_0_1px_0_var(--glass-sheen)]">
                <div className="flex items-center gap-3">
                  <span className="gloss grid size-8 place-items-center rounded-full border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-xs text-accent-fg">
                    ▶
                  </span>
                  <MeterArt bars={30} className="h-8 flex-1" />
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <span className="gloss rounded-full border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo px-2 py-0.5 text-xs text-accent-fg">
                  🔥 5
                </span>
                <span className="gloss rounded-full border border-glass-edge bg-elevated px-2 py-0.5 text-xs text-fg-2">
                  🎧 2
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="dock-glass relative -mt-4 ml-auto w-[78%] rotate-[3deg] rounded-[9px] p-3 shadow-[0_0_0_1px_var(--frame-edge),inset_0_1px_0_var(--dock-edge),var(--shadow-lg)]">
          <div className="flex items-center gap-2.5">
            <span className="relative">
              <span className="avatar-frame block size-8 rounded-avatar bg-linear-to-br from-[oklch(0.75_0.1_190)] to-[oklch(0.45_0.09_240)]" />
              <span className="absolute -right-1 -bottom-1 size-3.5 rounded-full border-2 border-[var(--dock-lo)] bg-[var(--presence-online)]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="h-2.5 w-20 rounded-full bg-[var(--dock-text)] opacity-80" />
              <div className="mt-1.5 h-2 w-28 rounded-full bg-[var(--dock-text-muted)] opacity-60" />
            </div>
          </div>
        </div>
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
  const name = config?.instanceName ?? t('common.appName');
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="relative min-h-dvh">
        <PublicBackdrop />
        <main id="main" className="relative mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6 lg:pt-8">
          <GlassWindow instant title={name} icon={<LogoMark className="size-4" />}>
            <div className="grid lg:grid-cols-[1.15fr_1fr]">
              <m.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.08 } } }}
                className="p-6 sm:p-10 lg:p-12"
              >
                <m.p variants={item} className="text-xs font-semibold tracking-[0.16em] text-accent-text uppercase">
                  {t('auth.welcome.eyebrow')}
                </m.p>
                <m.h1
                  variants={headline}
                  className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight text-fg text-balance sm:text-5xl lg:text-[3.4rem]"
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
                <m.ul variants={item} className="mt-10 grid gap-3 sm:grid-cols-2">
                  {FEATURES.map(({ icon, title, body }) => (
                    <li key={title} className="tile flex gap-3 p-3.5">
                      <Orb icon={icon} size="md" />
                      <span>
                        <span className="block font-semibold text-fg">{t(title)}</span>
                        <span className="mt-0.5 block text-sm text-fg-muted">{t(body)}</span>
                      </span>
                    </li>
                  ))}
                </m.ul>
              </m.div>
              <m.div
                initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="hidden border-l border-line-subtle lg:block"
              >
                <PreviewArt />
              </m.div>
            </div>
          </GlassWindow>
        </main>
      </div>
    </LazyMotion>
  );
}
