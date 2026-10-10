import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScene } from '../../stores/scene';
import { mount } from '../../test/render';
import { Wallpaper } from './Wallpaper';

const cleanups: (() => void)[] = [];
const render = () => {
  const view = mount(<Wallpaper />);
  cleanups.push(view.unmount);
  return () => view.host.querySelector('.wallpaper')?.hasAttribute('data-paused');
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  useScene.setState({ modals: 0 });
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('when the wallpaper moves', () => {
  it('moves while someone is there, rests after a minute without input and wakes on the next', () => {
    const paused = render();
    expect(paused()).toBe(false);
    act(() => vi.advanceTimersByTime(65_000));
    expect(paused()).toBe(true);
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(paused()).toBe(false);
  });

  it('holds still while you type or scroll, then moves again', () => {
    const paused = render();
    const input = document.createElement('textarea');
    document.body.append(input);
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
    // Not in the keystroke's own frame: a moment later.
    expect(paused()).toBe(false);
    act(() => vi.advanceTimersByTime(150));
    expect(paused()).toBe(true);
    act(() => vi.advanceTimersByTime(1300));
    expect(paused()).toBe(false);
    act(() => document.dispatchEvent(new Event('scroll')));
    expect(paused()).toBe(true);
    // A shortcut outside a text field is not typing.
    act(() => vi.advanceTimersByTime(1300));
    act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true })));
    expect(paused()).toBe(false);
    input.remove();
  });

  it('rests behind a dialog and while the browser is in the background', () => {
    const paused = render();
    act(() => useScene.getState().modalOpened());
    expect(paused()).toBe(true);
    act(() => useScene.getState().modalClosed());
    expect(paused()).toBe(false);
    act(() => window.dispatchEvent(new Event('blur')));
    expect(paused()).toBe(true);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(paused()).toBe(false);
  });
});
