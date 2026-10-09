import {
  Bell,
  Compass,
  House,
  LayoutGrid,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router';
import { t, type TKey } from '../../i18n';
import { dmDisplayName, useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { LogoMark } from '../../components/brand/Logo';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { ADMIN_SECTIONS } from '../admin/sections';
import { SETTINGS_SECTIONS } from '../settings/sections';

export interface PlaceLink {
  label: string;
  to: string;
  icon?: ReactNode;
  current?: boolean;
}

/** One segment of the address bar; its arrow lists the places one level below it. */
export interface Crumb {
  label: string;
  to?: string;
  icon?: ReactNode;
  children?: PlaceLink[];
}

export interface WindowPlace {
  title: string;
  icon: ReactNode;
  crumbs: Crumb[];
  /** Placeholder of the search field and where a search goes. */
  searchLabel: string;
  searchTo: (query: string) => string;
}

const icon = (Icon: LucideIcon) => <Icon className="size-4" aria-hidden />;

const searchAll = (q: string) => `/search?q=${encodeURIComponent(q)}`;

/** Where the window is: title, icon, breadcrumb and search scope, read from the address. */
export function useWindowPlace(): WindowPlace {
  const { pathname } = useLocation();
  const communities = useChat((s) => s.communities);
  const order = useChat((s) => s.communityOrder);
  const dms = useChat((s) => s.dms);
  const user = useSession((s) => s.user);

  const places: PlaceLink[] = [
    { label: t('shell.nav.home'), to: '/home', icon: icon(House) },
    { label: t('shell.nav.messagesShort'), to: '/dm', icon: icon(MessageCircle) },
    { label: t('shell.nav.notifications'), to: '/notifications', icon: icon(Bell) },
    { label: t('shell.nav.search'), to: '/search', icon: icon(Search) },
    { label: t('shell.nav.explore'), to: '/explore', icon: icon(Compass) },
    { label: t('shell.nav.communities'), to: '/communities', icon: icon(LayoutGrid) },
    { label: t('shell.nav.settings'), to: '/settings', icon: icon(Settings) },
    ...(user && user.platformRole !== 'member'
      ? [{ label: t('shell.nav.admin'), to: '/admin', icon: icon(ShieldCheck) }]
      : []),
  ].map((p) => ({ ...p, current: pathname.startsWith(p.to) }));
  const root: Crumb = {
    label: t('common.appName'),
    to: '/home',
    icon: <LogoMark className="size-4" />,
    children: places,
  };
  const page = (Icon: LucideIcon, label: string, to: string, children?: PlaceLink[]): WindowPlace => ({
    title: label,
    icon: icon(Icon),
    crumbs: [root, { label, to, icon: icon(Icon), children }],
    searchLabel: t('shell.window.searchAll'),
    searchTo: searchAll,
  });

  const inChannel = matchPath('/c/:communityId/:channelId', pathname);
  const inCommunity = inChannel ?? matchPath('/c/:communityId', pathname);
  if (inCommunity) {
    const c = communities[inCommunity.params.communityId ?? ''];
    if (c) {
      const ch = c.channels.find((x) => x.id === inChannel?.params.channelId);
      const cIcon = <CommunityIcon name={c.name} src={c.iconUrl} size="xs" />;
      const crumbs: Crumb[] = [
        root,
        {
          label: c.name,
          to: `/c/${c.id}`,
          icon: cIcon,
          children: c.channels.map((x) => ({
            label: `#${x.name}`,
            to: `/c/${c.id}/${x.id}`,
            current: x.id === ch?.id,
          })),
        },
      ];
      if (ch) crumbs.push({ label: `#${ch.name}` });
      return {
        title: ch ? `#${ch.name} — ${c.name}` : c.name,
        icon: cIcon,
        crumbs,
        searchLabel: t('shell.window.searchIn', { place: c.name }),
        searchTo: (q) => `/search?q=${encodeURIComponent(q)}&communityId=${c.id}`,
      };
    }
  }

  const dm = matchPath('/dm/:channelId', pathname);
  const dmLinks: PlaceLink[] = Object.values(dms)
    .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
    .slice(0, 12)
    .map((d) => ({
      label: dmDisplayName(d, user?.id ?? ''),
      to: `/dm/${d.id}`,
      current: d.id === dm?.params.channelId,
    }));
  if (pathname.startsWith('/dm')) {
    const conv = dm ? dms[dm.params.channelId ?? ''] : undefined;
    const base = page(MessageCircle, t('shell.nav.messagesShort'), '/dm', dmLinks);
    if (!conv) return base;
    const name = dmDisplayName(conv, user?.id ?? '');
    return { ...base, title: `${name} — ${t('shell.nav.messagesShort')}`, crumbs: [...base.crumbs, { label: name }] };
  }

  const settings = matchPath('/settings/:section?', pathname);
  if (settings) {
    const sectionLinks = SETTINGS_SECTIONS.map((s) => ({
      label: t(`settings.sections.${s.key}` as TKey),
      to: `/settings/${s.key}`,
      icon: icon(s.icon),
      current: s.key === settings.params.section,
    }));
    const base = page(Settings, t('shell.nav.settings'), '/settings', sectionLinks);
    const current = sectionLinks.find((s) => s.current);
    return current
      ? {
          ...base,
          title: `${current.label} — ${t('shell.nav.settings')}`,
          crumbs: [...base.crumbs, { label: current.label }],
        }
      : base;
  }

  const admin = matchPath('/admin/:section?', pathname);
  if (admin) {
    const isAdmin = user?.platformRole === 'admin';
    const sectionLinks = ADMIN_SECTIONS.filter((s) => isAdmin || !s.adminOnly).map((s) => ({
      label: t(`admin.sections.${s.key}` as TKey),
      to: `/admin/${s.key}`,
      icon: icon(s.icon),
      current: s.key === admin.params.section,
    }));
    const base = page(ShieldCheck, t('shell.nav.admin'), '/admin', sectionLinks);
    const current = sectionLinks.find((s) => s.current);
    return current
      ? {
          ...base,
          title: `${current.label} — ${t('shell.nav.admin')}`,
          crumbs: [...base.crumbs, { label: current.label }],
        }
      : base;
  }

  const profile = matchPath('/u/:username', pathname);
  if (profile) {
    const handle = `@${profile.params.username ?? ''}`;
    return { ...page(UserRound, handle, pathname), title: handle };
  }

  const communityLinks: PlaceLink[] = order.flatMap((id) => {
    const c = communities[id];
    return c
      ? [{ label: c.name, to: `/c/${c.id}`, icon: <CommunityIcon name={c.name} src={c.iconUrl} size="xs" /> }]
      : [];
  });
  if (pathname.startsWith('/communities'))
    return page(LayoutGrid, t('shell.nav.communities'), '/communities', communityLinks);
  if (pathname.startsWith('/explore')) return page(Compass, t('shell.nav.explore'), '/explore');
  if (pathname.startsWith('/notifications')) return page(Bell, t('shell.nav.notifications'), '/notifications');
  if (pathname.startsWith('/search')) return page(Search, t('shell.nav.search'), '/search');
  return page(House, t('shell.nav.home'), '/home', communityLinks);
}
