/**
 * Minimal, typed translation layer. All interface strings live in
 * `i18n/<locale>/*.ts`; components call `t('area.key', { vars })`.
 * Adding a language = adding a dictionary with the same shape and calling setLocale().
 */
import { en } from './en';

export type Messages = typeof en;
type Plural = { one: string; other: string };
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Leaves<Messages>;
export type TVars = Record<string, string | number>;

let locale = 'en';
let messages: Messages = en;

export function getLocale(): string {
  return locale;
}

export function setLocale(next: string, dict: Messages): void {
  locale = next;
  messages = dict;
  document.documentElement.lang = next;
}

function lookup(key: string): unknown {
  const parts = key.split('.');
  let value: unknown = messages;
  for (let i = 0; i < parts.length; i++) {
    const node = value as Record<string, unknown> | undefined;
    const next = node?.[parts[i] as string];
    // Leaf keys may themselves contain dots (e.g. audit action names like "member.joined").
    if (next === undefined) return node?.[parts.slice(i).join('.')];
    value = next;
  }
  return value;
}

export function t(key: TKey, vars?: TVars): string {
  let value = lookup(key);
  if (value && typeof value === 'object' && 'other' in value) {
    const plural = value as Plural & Record<string, string>;
    const rule = new Intl.PluralRules(locale).select(Number(vars?.count ?? 0));
    value = plural[rule] ?? plural.other;
  }
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** For keys built at runtime from server values (e.g. audit actions): null when no translation exists. */
export function tMaybe(key: string, vars?: TVars): string | null {
  const text = t(key as TKey, vars);
  return text === key ? null : text;
}
