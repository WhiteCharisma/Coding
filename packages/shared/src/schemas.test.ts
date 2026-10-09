import { describe, expect, it } from 'vitest';
import { extractMentions } from './mentions';
import { channelNameSchema, isEmoji, messageContentSchema, registerSchema, usernameSchema } from './schemas';
import { isSafeHttpUrl, normalizeMessageContent } from './text';

describe('mentions', () => {
  it('extracts usernames and @everyone, but not email addresses', () => {
    expect(extractMentions('hey @Mara.Okafor and @theolind!')).toEqual({
      usernames: ['mara.okafor', 'theolind'],
      everyone: false,
    });
    expect(extractMentions('ping @everyone')).toEqual({ usernames: [], everyone: true });
    expect(extractMentions('mail me at kenji@example.com')).toEqual({ usernames: [], everyone: false });
    expect(extractMentions('trailing dot @sofiamarin.')).toEqual({ usernames: ['sofiamarin'], everyone: false });
  });
});

describe('schemas', () => {
  it('normalises usernames and channel names', () => {
    expect(usernameSchema.parse('  Mara.Okafor ')).toBe('mara.okafor');
    expect(() => usernameSchema.parse('-bad')).toThrow();
    expect(channelNameSchema.parse('Mix Notes')).toBe('mix-notes');
    expect(() => channelNameSchema.parse('#general!')).toThrow();
  });

  it('strips control and bidi-override characters from messages', () => {
    expect(messageContentSchema.parse('hello‮world\u0007\r\nline')).toBe('helloworld\nline');
  });

  it('normalises message text the same way on the server and for unsent messages', () => {
    for (const raw of ['\n\nhi there  \n\n', 'a\r\nb\rc', '  indented\n']) {
      expect(normalizeMessageContent(raw)).toBe(messageContentSchema.parse(raw));
    }
    expect(normalizeMessageContent('\n\nhi there  \n\n')).toBe('hi there');
  });

  it('accepts only http(s) links without credentials', () => {
    expect(isSafeHttpUrl('https://example.com/portfolio')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('https://user:pass@example.com')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,hi')).toBe(false);
  });

  it('recognises single emoji (including sequences) and rejects text', () => {
    for (const e of ['🔥', '❤️', '🎚️', '👍🏽', '🇸🇪', '1️⃣', '👩‍🎤']) expect(isEmoji(e)).toBe(true);
    for (const e of ['a', 'fire', '1', '<script>', '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥'])
      expect(isEmoji(e)).toBe(false);
  });

  it('validates registration input', () => {
    const ok = registerSchema.safeParse({
      username: 'new.user',
      email: 'New@Example.com',
      password: 'long enough pass',
      displayName: '  New  User ',
    });
    expect(ok.success && ok.data.email).toBe('new@example.com');
    expect(ok.success && ok.data.displayName).toBe('New User');
    expect(registerSchema.safeParse({ username: 'x', email: 'bad', password: 'short', displayName: '' }).success).toBe(
      false,
    );
  });
});
