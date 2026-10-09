import type { MessageDTO, ReactionDTO } from '@creator-network/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { CountBadge } from '../../components/ui/badge';
import { useUi } from '../../stores/ui';
import { message } from '../../test/factories';
import { mount } from '../../test/render';
import { ReactionBar } from './Message';

const withReactions = (reactions: ReactionDTO[]): MessageDTO => message(1, { reactions });
const fire = (count: number, me = false): ReactionDTO => ({ emoji: '🔥', count, me });
const cleanups: (() => void)[] = [];
const render = (node: Parameters<typeof mount>[0]) => {
  const view = mount(node);
  cleanups.push(view.unmount);
  return view;
};

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  useUi.getState().setMotion('full');
});

describe('reaction motion', () => {
  it('reactions loaded with the message never animate', () => {
    const { host } = render(<ReactionBar message={withReactions([fire(3, true)])} canReact />);
    expect(host.querySelector('[class*="animate-"]')).toBeNull();
    expect(host.querySelector('.sparkle')).toBeNull();
  });

  it('a count change rolls the number in; adding your own reaction pops and sparkles', () => {
    const view = render(<ReactionBar message={withReactions([fire(1)])} canReact />);
    view.rerender(<ReactionBar message={withReactions([fire(2)])} canReact />);
    expect(view.host.querySelector('.animate-count-roll')?.textContent).toBe('2');
    expect(view.host.querySelector('.animate-reaction-pop')).toBeNull(); // someone else reacted

    view.rerender(<ReactionBar message={withReactions([fire(3, true)])} canReact />);
    expect(view.host.querySelector('.animate-reaction-pop')?.textContent).toBe('🔥');
    expect(view.host.querySelectorAll('.sparkle')).toHaveLength(6);
  });

  it('a reaction that appears while the message is on screen pops in', () => {
    const view = render(<ReactionBar message={withReactions([])} canReact />);
    view.rerender(<ReactionBar message={withReactions([fire(1, true)])} canReact />);
    const pill = view.host.querySelector('button[aria-pressed="true"]');
    expect(pill?.className).toContain('animate-badge-pop');
    expect(view.host.querySelectorAll('.sparkle')).toHaveLength(6);
  });

  it('Calm and Reduce motion drop the sparkles (decorative effects are marked .decor)', () => {
    useUi.getState().setMotion('calm');
    expect(document.documentElement.getAttribute('data-motion')).toBe('calm');
    const view = render(<ReactionBar message={withReactions([fire(1)])} canReact />);
    view.rerender(<ReactionBar message={withReactions([fire(2, true)])} canReact />);
    expect(view.host.querySelector('.sparkle')).toBeNull();
    expect(view.host.querySelector('.animate-reaction-pop')?.className).toContain('decor');
  });
});

describe('badge motion', () => {
  it('pops only when the number goes up while on screen', () => {
    const view = render(<CountBadge count={2} />);
    expect(view.host.querySelector('.animate-badge-pop')).toBeNull();
    view.rerender(<CountBadge count={3} />);
    expect(view.host.querySelector('.animate-badge-pop')).not.toBeNull();
    view.rerender(<CountBadge count={1} />);
    expect(view.host.querySelector('span')?.textContent).toBe('1');
  });
});
