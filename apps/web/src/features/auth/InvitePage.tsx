import type { CommunityDTO, InvitePreviewDTO } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { Link2Off, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { DemoBadge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Skeleton } from '../../components/ui/skeleton';
import { UserAvatar } from '../../components/user/UserAvatar';
import { AuthLayout, FormError } from './AuthLayout';

export default function InvitePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ['invite-preview', code, status],
    queryFn: () =>
      api
        .get<{ invite: InvitePreviewDTO }>(`/api/invites/${encodeURIComponent(code)}`, { quiet401: true })
        .then((r) => r.invite),
    enabled: status !== 'loading' && /^[A-Za-z0-9]{6,32}$/.test(code),
    retry: false,
  });

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const { community } = await api.post<{ community: CommunityDTO }>(
        `/api/invites/${encodeURIComponent(code)}/accept`,
      );
      if (useChat.getState().ready) useChat.getState().upsertCommunity(community);
      void navigate(`/c/${community.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const invalid = preview.isError || !/^[A-Za-z0-9]{6,32}$/.test(code);
  if (invalid) {
    return (
      <AuthLayout title={t('auth.invite.invalidTitle')}>
        <EmptyState
          icon={Link2Off}
          tone="danger"
          title={t('auth.invite.invalidTitle')}
          body={t('auth.invite.invalidBody')}
          className="px-0"
          actions={
            <Button asChild variant="primary">
              <Link to="/">{t('common.errors.goHome')}</Link>
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  const inv = preview.data;
  return (
    <AuthLayout title={t('auth.invite.title')}>
      {!inv ? (
        <div className="flex flex-col gap-3" role="status" aria-label={t('common.labels.loading')}>
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-testid="invite-preview">
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-elevated p-4">
            <CommunityIcon name={inv.community.name} src={inv.community.iconUrl} size="lg" />
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-fg">
                <span className="truncate">{inv.community.name}</span>
                {inv.community.isDemo && <DemoBadge />}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-fg-muted">
                <Users className="size-3.5" /> {t('common.labels.members', { count: inv.community.memberCount })}
              </p>
            </div>
          </div>
          {inv.community.description && <p className="text-fg-2">{inv.community.description}</p>}
          <div className="flex flex-col gap-1 text-sm text-fg-muted">
            {inv.inviter && (
              <p className="flex items-center gap-2">
                <UserAvatar name={inv.inviter.displayName} src={inv.inviter.avatarUrl} size="xs" />{' '}
                {t('auth.invite.by', { name: inv.inviter.displayName })}
              </p>
            )}
            {inv.expiresAt && <p>{t('auth.invite.expires', { date: formatDate(inv.expiresAt) })}</p>}
          </div>
          <FormError message={error} />
          {status === 'authenticated' ? (
            inv.alreadyMember ? (
              <Button variant="primary" size="lg" onClick={() => void navigate(`/c/${inv.community.id}`)}>
                {t('auth.invite.open')}
              </Button>
            ) : user && !user.onboardingCompleted ? (
              <Button asChild variant="primary" size="lg">
                <Link to={`/onboarding?invite=${encodeURIComponent(code)}`}>{t('auth.invite.accept')}</Link>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                onClick={() => void accept()}
                data-testid="accept-invite"
              >
                {t('auth.invite.accept')}
              </Button>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <Button asChild variant="primary" size="lg">
                <Link to={`/register?invite=${encodeURIComponent(code)}`}>{t('auth.invite.registerToJoin')}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link to={`/login?next=${encodeURIComponent(`/invite/${code}`)}`}>{t('auth.invite.signInToJoin')}</Link>
              </Button>
            </div>
          )}
          {inv.alreadyMember && <p className="text-center text-sm text-fg-muted">{t('auth.invite.alreadyMember')}</p>}
        </div>
      )}
    </AuthLayout>
  );
}
