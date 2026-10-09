import { DM_POLICIES, NOTIFICATION_PREF_KEYS, PRESENCE_PREFERENCES, type DmPolicy, type NotificationPrefKey, type SelfUser, type UserSummary } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { useUi, type Density, type MotionPref, type Theme } from '../../stores/ui';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/input';
import { Segmented } from '../../components/ui/segmented';
import { Skeleton } from '../../components/ui/skeleton';
import { Switch } from '../../components/ui/switch';
import { toast } from '../../components/ui/toast';
import { PresenceIcon } from '../../components/user/Presence';
import { UserAvatar } from '../../components/user/UserAvatar';
import { setPresencePreference } from '../shell/UserMenu';
import { SectionHeader, SettingsCard } from './parts';

async function savePreferences(patch: Record<string, unknown>) {
  try {
    const res = await api.patch<{ user: SelfUser }>('/api/me/preferences', patch);
    useSession.getState().setUser(res.user);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export function NotificationsSection({ user }: { user: SelfUser }) {
  const communities = useChat((s) => s.communities);
  const muted = user.mutedCommunityIds.map((id) => communities[id]).filter((c) => !!c);
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('settings.notifications.title')} subtitle={t('settings.notifications.subtitle')} />
      <SettingsCard>
        <div className="flex flex-col divide-y divide-line-subtle">
          {NOTIFICATION_PREF_KEYS.map((key: NotificationPrefKey) => (
            <Switch
              key={key}
              className="py-3 first:pt-0 last:pb-0"
              label={t(`settings.notifications.${key}`)}
              checked={user.notificationPrefs[key]}
              onCheckedChange={(v) => void savePreferences({ notificationPrefs: { [key]: v } })}
            />
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title={t('settings.notifications.muted')} description={t('settings.notifications.mutedHint')}>
        {muted.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('settings.notifications.noneMuted')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {muted.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <CommunityIcon name={c.name} src={c.iconUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-ui text-fg">{c.name}</span>
                <Button size="sm" onClick={() => void savePreferences({ mutedCommunityIds: user.mutedCommunityIds.filter((x) => x !== c.id) })}>
                  {t('settings.notifications.unmute')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  );
}

export function AppearanceSection() {
  const theme = useUi((s) => s.theme);
  const density = useUi((s) => s.density);
  const motion = useUi((s) => s.motion);
  const ui = useUi.getState();
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('settings.appearance.title')} />
      <SettingsCard title={t('settings.appearance.theme')}>
        <Segmented<Theme>
          label={t('settings.appearance.theme')}
          value={theme}
          onChange={ui.setTheme}
          options={[
            { value: 'dark', label: t('settings.appearance.dark') },
            { value: 'light', label: t('settings.appearance.light') },
            { value: 'system', label: t('settings.appearance.system') },
          ]}
        />
      </SettingsCard>
      <SettingsCard title={t('settings.appearance.density')}>
        <Segmented<Density>
          label={t('settings.appearance.density')}
          value={density}
          onChange={ui.setDensity}
          options={[
            { value: 'comfortable', label: t('settings.appearance.comfortable') },
            { value: 'compact', label: t('settings.appearance.compact') },
          ]}
        />
      </SettingsCard>
      <SettingsCard title={t('settings.appearance.motion')} description={t('settings.appearance.motionHint')}>
        <Segmented<MotionPref>
          label={t('settings.appearance.motion')}
          value={motion}
          onChange={ui.setMotion}
          options={[
            { value: 'full', label: t('settings.appearance.motionFull') },
            { value: 'reduced', label: t('settings.appearance.motionReduced') },
          ]}
        />
      </SettingsCard>
      <SettingsCard title={t('settings.appearance.language')} description={t('settings.appearance.languageHint')}>
        <Select value="en" disabled aria-label={t('settings.appearance.language')} className="max-w-xs">
          <option value="en">English</option>
        </Select>
      </SettingsCard>
    </div>
  );
}

function BlockedList() {
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: () => api.get<{ users: UserSummary[] }>('/api/me/blocks').then((r) => r.users) });
  const unblock = async (u: UserSummary) => {
    try {
      await api.del(`/api/users/${u.id}/block`);
      void blocks.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  if (blocks.isLoading) return <Skeleton className="h-12" />;
  if (!blocks.data?.length) return <p className="text-sm text-fg-muted">{t('settings.privacy.noBlocked')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {blocks.data.map((u) => (
        <li key={u.id} className="flex items-center gap-3">
          <UserAvatar name={u.displayName} src={u.avatarUrl} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-medium text-fg">{u.displayName}</span>
            <span className="block truncate text-xs text-fg-muted">@{u.username}</span>
          </span>
          <Button size="sm" onClick={() => void unblock(u)}>
            {t('common.actions.unblock')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function PrivacySection({ user }: { user: SelfUser }) {
  const labels: Record<DmPolicy, string> = { everyone: t('settings.privacy.dmEveryone'), communities: t('settings.privacy.dmCommunities'), nobody: t('settings.privacy.dmNobody') };
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('settings.privacy.title')} />
      <SettingsCard title={t('settings.privacy.dmPolicy')}>
        <div role="radiogroup" aria-label={t('settings.privacy.dmPolicy')} className="flex flex-col gap-2">
          {DM_POLICIES.map((p) => (
            <label key={p} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-ui transition-colors', user.dmPolicy === p ? 'border-accent-border bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
              <input type="radio" name="dm-policy" value={p} checked={user.dmPolicy === p} onChange={() => void savePreferences({ dmPolicy: p })} className="size-4 accent-[var(--accent)]" />
              {labels[p]}
            </label>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title={t('settings.privacy.presence')}>
        <div role="radiogroup" aria-label={t('settings.privacy.presence')} className="grid gap-2 sm:grid-cols-2">
          {PRESENCE_PREFERENCES.map((p) => (
            <label key={p} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors', user.presence === p ? 'border-accent-border bg-accent-soft' : 'border-line hover:border-line-strong')}>
              <input type="radio" name="presence" value={p} checked={user.presence === p} onChange={() => void setPresencePreference(p)} className="sr-only" />
              <PresenceIcon status={p === 'invisible' ? 'offline' : p} className="mt-1 size-3 shrink-0" />
              <span>
                <span className="block text-ui text-fg">{t(`common.presence.${p}`)}</span>
                <span className="block text-xs text-fg-muted">{t(`common.presenceHint.${p}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title={t('settings.privacy.blocked')}>
        <BlockedList />
      </SettingsCard>
    </div>
  );
}
