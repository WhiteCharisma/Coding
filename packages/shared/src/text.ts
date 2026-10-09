// Plain text helpers shared by the server and the browser. No dependencies (in particular
// no zod), so importing them does not pull the validation schemas into the web bundle.

/** Strips control characters (except newlines and tabs) that have no place in user text. */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '');
}

/**
 * Message text as the server stores it: control characters removed, line endings unified,
 * leading blank lines and trailing whitespace dropped. The client applies the same function to
 * messages it shows before the server confirms them, so the text never changes on confirmation.
 */
export function normalizeMessageContent(value: string): string {
  return stripControlChars(value)
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\s+$/g, '');
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    return url.hostname.includes('.') && url.hostname.length <= 253;
  } catch {
    return false;
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
