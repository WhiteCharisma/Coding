import type { NotificationDTO } from '@creator-network/shared';
import { t } from '../../i18n';

/** Human-readable notification text and where clicking it should go. */
export function describeNotification(n: NotificationDTO): { text: string; detail: string | null; href: string | null } {
  const actor = n.actor?.displayName ?? t('common.labels.deletedUser');
  const community = n.communityName ?? String(n.data.communityName ?? '');
  const channel = n.channelName ?? '';
  const preview = typeof n.data.preview === 'string' && n.data.preview ? n.data.preview : null;
  const reason = typeof n.data.reason === 'string' && n.data.reason ? t('notifications.reason', { reason: n.data.reason }) : null;
  const channelHref = n.channelId ? (n.communityId ? `/c/${n.communityId}/${n.channelId}` : `/dm/${n.channelId}`) : null;
  const withMessage = (href: string | null) => (href && n.messageId && n.communityId ? `${href}?m=${n.messageId}` : href);
  switch (n.type) {
    case 'dm':
      return { text: t('notifications.types.dm', { actor, count: n.count }), detail: preview, href: channelHref };
    case 'mention':
      return { text: t('notifications.types.mention', { actor, channel }), detail: preview, href: withMessage(channelHref) };
    case 'reply':
      return { text: t('notifications.types.reply', { actor, channel }), detail: preview, href: withMessage(channelHref) };
    case 'invite':
      return { text: t('notifications.types.invite', { actor, community }), detail: null, href: typeof n.data.code === 'string' ? `/invite/${n.data.code}` : null };
    case 'community': {
      const event = String(n.data.event ?? '');
      if (event === 'member_joined') return { text: t('notifications.types.member_joined', { actor, community }), detail: null, href: n.communityId ? `/c/${n.communityId}` : null };
      if (event === 'ownership_transferred') return { text: t('notifications.types.ownership_transferred', { actor, community }), detail: null, href: n.communityId ? `/c/${n.communityId}` : null };
      return { text: t('notifications.types.generic'), detail: null, href: null };
    }
    case 'moderation': {
      const event = String(n.data.event ?? '');
      const key = (['kicked', 'banned', 'message_removed', 'warning', 'restored', 'report_reviewed', 'community_removed'] as const).find((k) => k === event);
      return { text: key ? t(`notifications.types.${key}`, { community }) : t('notifications.types.generic'), detail: reason, href: null };
    }
    default:
      return { text: t('notifications.types.generic'), detail: null, href: null };
  }
}
