import {
  LIMITS,
  type CommunityDTO,
  type Discipline,
  type InvitePreviewDTO,
  type SelfUser,
} from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Hash, MessagesSquare, Plus, UserRound } from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useReduceMotion } from '../../lib/motion';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { Logo } from '../../components/brand/Logo';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { Button } from '../../components/ui/button';
import { Field, Input, Textarea } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { AvatarUploader } from '../../components/user/AvatarUploader';
import { DisciplinePicker } from '../../components/user/DisciplinePicker';
import { CreateCommunityForm, JoinWithInvite } from '../community/CreateJoinDialog';
import { CommunityCard, useExplore } from '../explore/ExplorePage';

const STEPS = ['profile', 'disciplines', 'community', 'tour'] as const;
type Step = (typeof STEPS)[number];

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg text-balance">{title}</h1>
      {subtitle && <p className="mt-2 text-fg-muted">{subtitle}</p>}
    </div>
  );
}

function PendingInvite({ code, onJoined }: { code: string; onJoined: (c: CommunityDTO) => void }) {
  const joined = useChat((s) => s.communities);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: ['invite-preview', code],
    queryFn: () =>
      api.get<{ invite: InvitePreviewDTO }>(`/api/invites/${encodeURIComponent(code)}`).then((r) => r.invite),
    retry: false,
  });
  if (preview.isError)
    return (
      <p className="rounded-xl border border-line bg-elevated p-4 text-sm text-fg-muted">
        {t('auth.invite.invalidBody')}
      </p>
    );
  if (!preview.data) return <Skeleton className="h-20 rounded-2xl" />;
  const inv = preview.data;
  const isMember = inv.alreadyMember || !!joined[inv.community.id];
  const accept = async () => {
    setBusy(true);
    try {
      const { community } = await api.post<{ community: CommunityDTO }>(
        `/api/invites/${encodeURIComponent(code)}/accept`,
      );
      useChat.getState().upsertCommunity(community);
      onJoined(community);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex items-center gap-4 rounded-2xl border border-accent-border bg-accent-soft p-4"
      data-testid="onboarding-invite"
    >
      <CommunityIcon name={inv.community.name} src={inv.community.iconUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-fg">{inv.community.name}</p>
        <p className="text-sm text-fg-muted">
          {inv.inviter
            ? t('auth.invite.by', { name: inv.inviter.displayName })
            : t('common.labels.members', { count: inv.community.memberCount })}
        </p>
      </div>
      {isMember ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
          <Check className="size-4" /> {t('common.actions.joined')}
        </span>
      ) : (
        <Button variant="primary" loading={busy} onClick={() => void accept()}>
          {t('auth.invite.accept')}
        </Button>
      )}
    </div>
  );
}

function CommunityStep({ invite, onJoined }: { invite: string | null; onJoined: (c: CommunityDTO) => void }) {
  const config = useSession((s) => s.config);
  const user = useSession((s) => s.user);
  const explore = useExplore('', null);
  const [creating, setCreating] = useState(false);
  const canCreate = config?.communityCreation !== 'admins' || user?.platformRole === 'admin';
  return (
    <div className="flex flex-col gap-7">
      {invite && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-fg-2">
            {t('onboarding.community.pendingInvite')}
          </h2>
          <PendingInvite code={invite} onJoined={onJoined} />
        </section>
      )}
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-fg-2">{t('onboarding.community.haveInvite')}</h2>
        <JoinWithInvite onJoined={onJoined} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-fg-2">{t('onboarding.community.explore')}</h2>
        {explore.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        ) : explore.data && explore.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {explore.data.slice(0, 6).map((c) => (
              <CommunityCard key={c.id} c={c} onJoined={onJoined} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t('onboarding.community.exploreEmpty')}</p>
        )}
      </section>
      {canCreate && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-fg-2">{t('onboarding.community.create')}</h2>
          {creating ? (
            <div className="rounded-2xl border border-line bg-elevated p-4 animate-pop-in">
              <p className="mb-4 text-sm text-fg-muted">{t('onboarding.community.createHint')}</p>
              <CreateCommunityForm compact onCreated={onJoined} />
            </div>
          ) : (
            <Button onClick={() => setCreating(true)}>
              <Plus /> {t('onboarding.community.create')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function TourStep() {
  const items = [
    { icon: Hash, title: t('onboarding.tour.channelsTitle'), body: t('onboarding.tour.channelsBody') },
    { icon: MessagesSquare, title: t('onboarding.tour.dmTitle'), body: t('onboarding.tour.dmBody') },
    { icon: UserRound, title: t('onboarding.tour.profileTitle'), body: t('onboarding.tour.profileBody') },
  ];
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex gap-4 rounded-2xl border border-line-subtle bg-elevated p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-inset text-accent-text">
            <Icon className="size-5" />
          </span>
          <span>
            <span className="block font-semibold text-fg">{title}</span>
            <span className="mt-0.5 block text-sm text-fg-muted">{body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invite = params.get('invite');
  const user = useSession((s) => s.user);
  const config = useSession((s) => s.config);
  const reduce = useReduceMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [headline, setHeadline] = useState(user?.headline ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [disciplines, setDisciplines] = useState<Discipline[]>(user?.disciplines ?? []);
  const [lastJoined, setLastJoined] = useState<CommunityDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const step: Step = STEPS[stepIndex] ?? 'profile';

  if (!user) return null;

  const go = (delta: number) => {
    setDirection(delta);
    setStepIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
  };

  const saveAndNext = async () => {
    setBusy(true);
    try {
      if (step === 'profile' && (headline !== user.headline || bio !== user.bio)) {
        const res = await api.patch<{ user: SelfUser }>('/api/me/profile', { headline, bio });
        useSession.getState().setUser(res.user);
      }
      if (step === 'disciplines' && disciplines.join() !== user.disciplines.join()) {
        const res = await api.patch<{ user: SelfUser }>('/api/me/profile', { disciplines });
        useSession.getState().setUser(res.user);
      }
      if (step === 'tour') {
        const res = await api.post<{ user: SelfUser }>('/api/me/onboarding/complete');
        useSession.getState().setUser(res.user);
        const target = lastJoined ?? Object.values(useChat.getState().communities)[0];
        void navigate(target ? `/c/${target.id}` : '/home', { replace: true });
        return;
      }
      go(1);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onJoined = (c: CommunityDTO) => {
    setLastJoined(c);
    toast.success(t('community.join.joined', { name: c.name }));
  };

  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * -28 }),
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="flex min-h-dvh flex-col bg-app">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-5 pt-6 sm:px-8">
          <Logo name={config?.instanceName ?? t('common.appName')} />
          <span className="font-mono text-xs text-fg-muted">
            {t('onboarding.progress', { current: stepIndex + 1, total: STEPS.length })}
          </span>
        </header>
        <div className="mx-auto mt-5 flex w-full max-w-2xl gap-1.5 px-5 sm:px-8" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-[var(--dur-slow)]',
                i <= stepIndex ? 'bg-accent' : 'bg-line',
              )}
            />
          ))}
        </div>
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 pb-32 sm:px-8">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <m.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduce ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 'profile' && (
                <>
                  <StepHeading title={t('onboarding.profile.title')} subtitle={t('onboarding.profile.subtitle')} />
                  <div className="flex flex-col gap-6">
                    <AvatarUploader hint={t('onboarding.profile.avatarHint')} />
                    <Field label={t('onboarding.profile.headline')} optional={t('common.labels.optional')}>
                      {(p) => (
                        <Input
                          {...p}
                          value={headline}
                          onChange={(e) => setHeadline(e.target.value)}
                          maxLength={LIMITS.headlineMax}
                          placeholder={t('onboarding.profile.headlinePlaceholder')}
                        />
                      )}
                    </Field>
                    <Field label={t('onboarding.profile.bio')} optional={t('common.labels.optional')}>
                      {(p) => (
                        <Textarea
                          {...p}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          maxLength={LIMITS.bioMax}
                          rows={4}
                          placeholder={t('onboarding.profile.bioPlaceholder')}
                        />
                      )}
                    </Field>
                  </div>
                </>
              )}
              {step === 'disciplines' && (
                <>
                  <StepHeading
                    title={t('onboarding.disciplines.title')}
                    subtitle={t('onboarding.disciplines.subtitle', { max: LIMITS.disciplinesMax })}
                  />
                  <DisciplinePicker
                    value={disciplines}
                    onChange={setDisciplines}
                    label={t('onboarding.disciplines.title')}
                  />
                </>
              )}
              {step === 'community' && (
                <>
                  <StepHeading title={t('onboarding.community.title')} subtitle={t('onboarding.community.subtitle')} />
                  <CommunityStep invite={invite} onJoined={onJoined} />
                </>
              )}
              {step === 'tour' && (
                <>
                  <StepHeading title={t('onboarding.tour.title')} subtitle={t('onboarding.tour.subtitle')} />
                  <TourStep />
                </>
              )}
            </m.div>
          </AnimatePresence>
        </main>
        <footer className="fixed inset-x-0 bottom-0 border-t border-line-subtle bg-app/90 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-4 sm:px-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              variant="ghost"
              onClick={() => go(-1)}
              disabled={stepIndex === 0 || busy}
              className={cn(stepIndex === 0 && 'invisible')}
            >
              <ArrowLeft /> {t('common.actions.back')}
            </Button>
            <div className="flex items-center gap-2">
              {step !== 'tour' && (
                <Button variant="ghost" onClick={() => go(1)} disabled={busy}>
                  {t('common.actions.skip')}
                </Button>
              )}
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                onClick={() => void saveAndNext()}
                data-testid="onboarding-next"
              >
                {step === 'tour' ? t('onboarding.tour.finish') : t('common.actions.continue')}
                {step !== 'tour' && <ArrowRight />}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </LazyMotion>
  );
}
