import { MessageCircle, Users } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { t } from '../../i18n';
import { dmDisplayName, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { UserAvatar } from '../../components/user/UserAvatar';
import { ChannelView } from '../chat/ChannelView';
import { ChannelHeader } from '../community/ChannelHeader';
import { ContextPanel, PinsPanel } from '../community/ContextPanel';
import { SidebarLayout } from '../shell/SidebarLayout';
import { DmSidebar } from './DmSidebar';
import { NewDmDialog } from './NewDmDialog';

export function DmIndexPage() {
  const [open, setOpen] = useState(false);
  return (
    <SidebarLayout mobileView="sidebar" sidebar={<DmSidebar />}>
      <div className="grid flex-1 place-items-center">
        <EmptyState
          icon={MessageCircle}
          title={t('dm.selectTitle')}
          body={t('dm.selectBody')}
          actions={
            <Button variant="primary" onClick={() => setOpen(true)}>
              {t('dm.new')}
            </Button>
          }
        />
      </div>
      <NewDmDialog open={open} onOpenChange={setOpen} />
    </SidebarLayout>
  );
}

export function DmPage() {
  const { channelId = '' } = useParams();
  const dm = useChat((s) => s.dms[channelId]);
  const user = useSession((s) => s.user);
  const [panel, setPanel] = useState<'pins' | null>(null);
  if (!dm || !user) return <Navigate to="/dm" replace />;
  const name = dmDisplayName(dm, user.id);
  const others = dm.participants.filter((p) => p.id !== user.id);
  const first = others[0];
  const blocked = (dm.myPermissions & 2) === 0;
  return (
    <SidebarLayout mobileView="content" sidebar={<DmSidebar />} contentLabel={name}>
      <ChannelHeader
        title={name}
        icon={dm.kind === 'group_dm' ? <Users className="size-5 shrink-0 text-fg-faint" /> : <UserAvatar name={first?.displayName ?? name} src={first?.avatarUrl} size="sm" />}
        backTo="/dm"
        panelButtons={['pins']}
        activePanel={panel}
        onTogglePanel={() => setPanel(panel ? null : 'pins')}
      />
      <div className="flex min-h-0 flex-1">
        <ChannelView
          key={dm.id}
          channelId={dm.id}
          communityId={null}
          isDm
          permissions={dm.myPermissions}
          placeholder={t('chat.composer.placeholderDm', { name })}
          disabledReason={blocked ? t('chat.composer.placeholderBlocked') : undefined}
          mentionCandidates={others}
          beginning={
            <div className="px-4 pt-10 pb-4">
              {dm.kind === 'dm' && first ? <UserAvatar name={first.displayName} src={first.avatarUrl} size="xl" /> : <span className="grid size-16 place-items-center rounded-full bg-elevated"><Users className="size-7 text-fg-2" /></span>}
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg">{name}</h2>
              {dm.kind === 'dm' && first && <p className="text-sm text-fg-muted">@{first.username}{first.headline ? ` · ${first.headline}` : ''}</p>}
              <p className="mt-2 text-sm text-fg-muted">{dm.kind === 'dm' ? t('chat.list.beginningDm', { name }) : t('chat.list.beginningGroup', { name })}</p>
            </div>
          }
        />
        <ContextPanel panel={panel} title={t('chat.pins.title')} onClose={() => setPanel(null)}>
          <PinsPanel channelId={dm.id} />
        </ContextPanel>
      </div>
    </SidebarLayout>
  );
}
