/**
 * Mentions are written as plain text: "@username", "@everyone" or "@here".
 * The server resolves usernames to user IDs when a message is stored; the
 * client uses the same tokenizer to highlight them.
 */
export const MENTION_RE = /(^|[^A-Za-z0-9_@.])@([a-z0-9](?:[a-z0-9_.-]{0,30}[a-z0-9])?)(?![A-Za-z0-9_])/gi;

export interface ParsedMentions {
  usernames: string[];
  everyone: boolean;
}

export function extractMentions(content: string, limit = 20): ParsedMentions {
  const usernames = new Set<string>();
  let everyone = false;
  for (const match of content.matchAll(MENTION_RE)) {
    const name = (match[2] ?? '').toLowerCase();
    if (name === 'everyone' || name === 'here') {
      everyone = true;
      continue;
    }
    if (usernames.size < limit) usernames.add(name);
  }
  return { usernames: [...usernames], everyone };
}
