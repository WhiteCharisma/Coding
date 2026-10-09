import { getLocale } from '../i18n';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Creation time encoded in a ULID (server-generated ids are time-sortable). */
export function timeFromId(id: string): number {
  let t = 0;
  for (const ch of id.slice(0, 10)) t = t * 32 + ALPHABET.indexOf(ch);
  return t;
}

/** Random idempotency key for a message (URL-safe, 22 chars). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 22);
}

const dayMs = 24 * 60 * 60 * 1000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function formatTime(t: number): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit' }).format(t);
}

export function formatDateTime(t: number): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(t);
}

export function formatDate(t: number): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(t);
}

/** "Today", "Yesterday", "Monday 6 October", "6 October 2025". */
export function formatDayLabel(t: number, labels: { today: string; yesterday: string }): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(t);
  if (day === today) return labels.today;
  if (day === today - dayMs) return labels.yesterday;
  const sameYear = new Date(t).getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(getLocale(), sameYear ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(t);
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Compact relative time: "now", "5m", "3h", "2d", then a date. */
export function formatRelative(t: number): string {
  const diff = Date.now() - t;
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto', style: 'narrow' });
  if (diff < 45_000) return rtf.format(0, 'second');
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (diff < dayMs) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  if (diff < 7 * dayMs) return rtf.format(-Math.round(diff / dayMs), 'day');
  return formatDate(t);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Current local time for a profile's time zone, e.g. "21:14". */
export function localTimeIn(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', timeZone }).format(Date.now());
  } catch {
    return null;
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** Stable hue (0–360) derived from a string — used for avatar fallbacks. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
