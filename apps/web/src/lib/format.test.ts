import { describe, expect, it } from 'vitest';
import { getLocale } from '../i18n';
import { formatDate, formatDateTime, formatDayLabel, formatRelative, formatTime } from './format';

const t = Date.UTC(2026, 9, 5, 14, 7);

describe('date formatting', () => {
  it('matches Intl for the current locale, call after call (formatters are reused)', () => {
    const intl = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(getLocale(), o).format(t);
    for (let i = 0; i < 3; i++) {
      expect(formatTime(t)).toBe(intl({ hour: '2-digit', minute: '2-digit' }));
      expect(formatDateTime(t)).toBe(intl({ dateStyle: 'medium', timeStyle: 'short' }));
      expect(formatDate(t)).toBe(intl({ dateStyle: 'medium' }));
    }
  });

  it('labels days and relative times', () => {
    expect(formatDayLabel(Date.now(), { today: 'Today', yesterday: 'Yesterday' })).toBe('Today');
    expect(formatDayLabel(Date.now() - 86_400_000, { today: 'Today', yesterday: 'Yesterday' })).toBe('Yesterday');
    expect(formatRelative(Date.now())).toBe(
      new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(0, 'second'),
    );
  });
});
