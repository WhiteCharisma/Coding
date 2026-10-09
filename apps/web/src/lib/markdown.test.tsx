import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatMessage, renderHighlight, stripFormatting } from './markdown';

const html = (content: string, mentions: string[] = []) =>
  renderToStaticMarkup(<>{formatMessage(content, { mentions: new Set(mentions), selfUsername: 'me' })}</>);

describe('message formatting', () => {
  it('never turns user text into HTML', () => {
    const out = html('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('links only http(s) URLs, opening safely in a new tab', () => {
    const out = html('see https://example.com/a?b=1 and javascript:alert(1) and [x](javascript:alert(1))');
    expect(out).toContain('href="https://example.com/a?b=1"');
    expect(out).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toMatch(/href="javascript:/i);
  });

  it('formats bold, italic, strike and inline code; code is not formatted inside', () => {
    const out = html('**bold** *it* ~~gone~~ `**raw**`');
    expect(out).toMatch(/<strong[^>]*>bold<\/strong>/);
    expect(out).toMatch(/<em[^>]*>it<\/em>/);
    expect(out).toMatch(/<s[^>]*>gone<\/s>/);
    expect(out).toMatch(/<code[^>]*>\*\*raw\*\*<\/code>/);
  });

  it('adds no empty line around code blocks (text is shown with pre-wrap)', () => {
    const out = html('intro\n```\nconst x = 1;\n```\noutro');
    // The block breaks the line itself: the newlines next to it must not become blank lines.
    expect(out).toMatch(/^intro<pre/);
    expect(out).toMatch(/<\/pre>outro$/);
    expect(out).toContain('<code>const x = 1;</code>');
  });

  it('keeps line breaks but caps runs of blank lines at one', () => {
    expect(html('line one\nline two')).toBe('line one\nline two');
    expect(html('para one\n\npara two')).toBe('para one\n\npara two');
    expect(html('para one\n\n\n\n\n\npara two')).toBe('para one\n\npara two');
    // Code keeps its own blank lines untouched.
    expect(html('```\na\n\n\n\nb\n```')).toContain('<code>a\n\n\n\nb</code>');
  });

  it('highlights only mentions the server resolved', () => {
    const out = html('hi @bob and @ghost', ['bob']);
    expect(out).toMatch(/<[^>]+>@bob<\//);
    expect(out).toContain('@ghost');
    expect(out).not.toMatch(/<[^>]+>@ghost<\//);
  });

  it('renders search highlight markers without HTML injection', () => {
    const out = renderToStaticMarkup(<>{renderHighlight('a \u0001<b>match</b>\u0002 z')}</>);
    expect(out).toContain('<mark');
    expect(out).toContain('&lt;b&gt;match&lt;/b&gt;');
  });

  it('strips formatting for previews', () => {
    expect(stripFormatting('**bold** `code` ~~x~~')).toBe('bold code x');
  });
});
