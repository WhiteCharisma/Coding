import { Activity, Archive, Flag, Landmark, ScrollText, Settings2, Ticket, Users } from 'lucide-react';

/** Administration sections (shared by the admin page and the window's address bar). */
export const ADMIN_SECTIONS = [
  { key: 'overview', icon: Activity, adminOnly: false },
  { key: 'reports', icon: Flag, adminOnly: false },
  { key: 'users', icon: Users, adminOnly: false },
  { key: 'communities', icon: Landmark, adminOnly: false },
  { key: 'invites', icon: Ticket, adminOnly: true },
  { key: 'settings', icon: Settings2, adminOnly: true },
  { key: 'backups', icon: Archive, adminOnly: true },
  { key: 'audit', icon: ScrollText, adminOnly: false },
] as const;
export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]['key'];
