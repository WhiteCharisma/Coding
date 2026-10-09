import { Permission } from '@creator-network/shared';
import { Hash, Lock, Megaphone, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { t } from '../../i18n';
import { useChat } from '../../stores/chat';
import { useUi } from '../../stores/ui';
import { buttonVariants } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { ChannelView } from '../chat/ChannelView';
import { SidebarLayout } from '../shell/SidebarLayout';
import { useIsDesktop, useIsWide } from '../shell/hooks';
import { ChannelHeader } from './ChannelHeader';
import { CommunitySidebar } from './CommunitySidebar';
import { ContextPanel, MembersPanel, PinsPanel } from './ContextPanel';
import { useCommunityMembers, useRoleColors } from './hooks';

const lastChannelKey = (communityId: string) => `cn.lastChannel.${communityId}`;

function MissingCommunity() {
  return (
    <main className="grid flex-1 place-items-center bg-main">
      <EmptyState
        icon={SearchX}
        title={t('common.errors.notFoundTitle')}
        body={t('common.errors.notFoundBody')}
        actions={
          <Link to="/home" className={buttonVariants({ variant: 'primary' })}>
            {t('common.errors.goHome')}
          </Link>
        }
      />
    </main>
  );
}

export function CommunityIndexPage() {
  const { communityId = '' } = useParams();
  const community = useChat((s) => s.communities[communityId]);
  const isDesktop = useIsDesktop();
  if (!community) return <MissingCommunity />;
  if (isDesktop || community.channels.length > 0) {
    let last: string | null = null;
    try {
      last = localStorage.getItem(lastChannelKey(communityId));
    } catch {
      /* ignore */
    }
    const target = community.channels.find((c) => c.id === last) ?? community.channels[0];
    if (isDesktop && target) return <Navigate to={`/c/${communityId}/${target.id}`} replace />;
  }
  return (
    <SidebarLayout mobileView="sidebar" sidebar={<CommunitySidebar community={community} />}>
      <div className="flex-1" />
    </SidebarLayout>
  );
}

export function ChannelPage() {
  const { communityId = '', channelId = '' } = useParams();
  const community = useChat((s) => s.communities[communityId]);
  const channel = community?.channels.find((c) => c.id === channelId);
  const storedPanel = useUi((s) => s.contextPanel);
  const setStoredPanel = useUi((s) => s.setContextPanel);
  const wide = useIsWide();
  // On narrow screens the panel is an overlay that belongs to the channel it was opened in.
  const [narrow, setNarrow] = useState<{ channelId: string; panel: 'members' | 'pins' } | null>(null);
  const narrowPanel = narrow?.channelId === channelId ? narrow.panel : null;
  const setNarrowPanel = (p: 'members' | 'pins' | null) => setNarrow(p ? { channelId, panel: p } : null);
  const panel = wide ? storedPanel : narrowPanel;
  const members = useCommunityMembers(community ? communityId : null);
  const roleColor = useRoleColors(community, members.data);

  useEffect(() => {
    if (!channel) return;
    try {
      localStorage.setItem(lastChannelKey(communityId), channelId);
    } catch {
      /* ignore */
    }
  }, [communityId, channelId, channel]);

  if (!community) return <MissingCommunity />;
  if (!channel) {
    const first = community.channels[0];
    return first ? (
      <Navigate to={`/c/${communityId}/${first.id}`} replace />
    ) : (
      <Navigate to={`/c/${communityId}`} replace />
    );
  }

  const canSend = (channel.myPermissions & (Permission.SEND_MESSAGES | Permission.ADMINISTRATOR)) !== 0;
  const toggle = (p: 'members' | 'pins') =>
    wide ? setStoredPanel(storedPanel === p ? null : p) : setNarrowPanel(narrowPanel === p ? null : p);
  const close = () => (wide ? setStoredPanel(null) : setNarrowPanel(null));
  const iconKind = channel.isPrivate ? 'lock' : canSend ? 'hash' : 'megaphone';
  const BeginIcon = channel.isPrivate ? Lock : canSend ? Hash : Megaphone;

  return (
    <SidebarLayout
      mobileView="content"
      sidebar={<CommunitySidebar community={community} />}
      contentLabel={`#${channel.name}`}
    >
      <ChannelHeader
        title={channel.name}
        topic={channel.topic}
        icon={iconKind}
        backTo={`/c/${communityId}`}
        activePanel={panel}
        onTogglePanel={toggle}
        searchTo={`/search?communityId=${communityId}`}
      />
      <div className="flex min-h-0 flex-1">
        <ChannelView
          key={channel.id}
          channelId={channel.id}
          communityId={communityId}
          isDm={false}
          permissions={channel.myPermissions}
          placeholder={t('chat.composer.placeholder', { channel: channel.name })}
          disabledReason={t('chat.composer.placeholderReadOnly')}
          mentionCandidates={(members.data ?? []).map((m) => m.user)}
          roleColor={roleColor}
          beginning={
            <div className="px-4 pt-10 pb-4">
              <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                <BeginIcon className="size-7" />
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">
                {t('chat.list.beginningTitle', { channel: channel.name })}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">{channel.topic || t('chat.list.beginningBody')}</p>
              {canSend && <p className="mt-1 text-sm text-fg-muted">{t('chat.list.emptyHint')}</p>}
            </div>
          }
        />
        <ContextPanel
          panel={panel}
          title={panel === 'pins' ? t('chat.pins.title') : t('community.members.title')}
          onClose={close}
        >
          {panel === 'pins' ? (
            <PinsPanel channelId={channel.id} />
          ) : (
            <MembersPanel community={community} members={members.data} />
          )}
        </ContextPanel>
      </div>
    </SidebarLayout>
  );
}
