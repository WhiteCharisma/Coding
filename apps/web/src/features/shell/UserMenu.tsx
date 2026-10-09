import type { PresencePreference } from '@creator-network/shared';
import { LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { PresenceIcon } from '../../components/user/Presence';
import { UserAvatar } from '../../components/user/UserAvatar';
import { toast } from '../../components/ui/toast';
import type { SelfUser } from '@creator-network/shared';

const PREFS: PresencePreference[] = ['online', 'idle', 'dnd', 'invisible'];

export async function setPresencePreference(presence: PresencePreference) {
  try {
    const { user } = await api.patch<{ user: SelfUser }>('/api/me/preferences', { presence });
    useSession.getState().setUser(user);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export function UserMenu({ side = 'right', className }: { side?: 'right' | 'top'; className?: string }) {
  const user = useSession((s) => s.user);
  const status = useChat((s) => (user ? (s.presence[user.id] ?? 'online') : 'offline'));
  const navigate = useNavigate();
  if (!user) return null;
  const shown = user.presence === 'invisible' ? 'offline' : user.presence === 'online' ? status : user.presence;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" aria-label={t('shell.userMenu.label')} className={cn('rounded-full transition-transform active:scale-95', className)}>
          <UserAvatar name={user.displayName} src={user.avatarUrl} size="lg" presence={shown} />
        </button>
      </MenuTrigger>
      <MenuContent side={side} align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <UserAvatar name={user.displayName} src={user.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{user.displayName}</p>
            <p className="truncate text-xs text-fg-muted">@{user.username}</p>
          </div>
        </div>
        <MenuSeparator />
        <MenuLabel>{t('shell.userMenu.setStatus')}</MenuLabel>
        <MenuRadioGroup value={user.presence} onValueChange={(v) => void setPresencePreference(v as PresencePreference)}>
          {PREFS.map((p) => (
            <MenuRadioItem key={p} value={p}>
              <PresenceIcon status={p === 'invisible' ? 'offline' : p} className="size-3" />
              <span className="flex flex-col">
                <span>{t(`common.presence.${p}`)}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onSelect={() => void navigate(`/u/${user.username}`)}>
          <UserRound /> {t('shell.userMenu.profile')}
        </MenuItem>
        <MenuItem onSelect={() => void navigate('/settings')}>
          <Settings /> {t('shell.userMenu.settings')}
        </MenuItem>
        {user.platformRole !== 'member' && (
          <MenuItem onSelect={() => void navigate('/admin')}>
            <ShieldCheck /> {t('shell.userMenu.admin')}
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem danger onSelect={() => void useSession.getState().logout()}>
          <LogOut /> {t('shell.userMenu.signOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
