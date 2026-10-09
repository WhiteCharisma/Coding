import { AudioLines, Bell, MonitorSmartphone, Palette, ShieldHalf, UserRound, UserRoundCog } from 'lucide-react';

/** Settings sections (shared by the settings page and the window's address bar). */
export const SETTINGS_SECTIONS = [
  { key: 'profile', icon: UserRound },
  { key: 'account', icon: UserRoundCog },
  { key: 'sessions', icon: MonitorSmartphone },
  { key: 'notifications', icon: Bell },
  { key: 'voice', icon: AudioLines },
  { key: 'appearance', icon: Palette },
  { key: 'privacy', icon: ShieldHalf },
] as const;
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]['key'];
