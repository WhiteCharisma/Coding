import { beforeEach, describe, expect, it, vi } from 'vitest';
import themeInit from '../../public/theme-init.js?raw';
import { useUi, WINDOW_COLORS } from './ui';

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute('style');
  root.removeAttribute('data-transparency');
});

describe('window colour', () => {
  it('applies colour, intensity and transparency at once and keeps them for the next visit', () => {
    useUi.getState().setGlass({ color: 'ruby', strength: 75, transparency: false });
    expect(root.style.getPropertyValue('--frame-h')).toBe(String(WINDOW_COLORS.ruby.h));
    expect(root.style.getPropertyValue('--frame-c')).toBe(String(WINDOW_COLORS.ruby.c));
    expect(root.style.getPropertyValue('--frame-strength')).toBe('0.75');
    expect(root.getAttribute('data-transparency')).toBe('off');
    expect(JSON.parse(localStorage.getItem('cn.glass') ?? 'null')).toEqual({
      color: 'ruby',
      strength: 75,
      transparency: false,
      h: WINDOW_COLORS.ruby.h,
      c: WINDOW_COLORS.ruby.c,
    });
    useUi.getState().setGlass({ transparency: true });
    expect(root.hasAttribute('data-transparency')).toBe(false);
  });

  it('the pre-paint script gives the page the same glass before the app has loaded', () => {
    useUi.getState().setGlass({ color: 'leaf', strength: 20, transparency: false });
    root.removeAttribute('style');
    root.removeAttribute('data-transparency');
    new Function(themeInit)();
    expect(root.style.getPropertyValue('--frame-h')).toBe(String(WINDOW_COLORS.leaf.h));
    expect(root.style.getPropertyValue('--frame-c')).toBe(String(WINDOW_COLORS.leaf.c));
    expect(root.style.getPropertyValue('--frame-strength')).toBe('0.2');
    expect(root.getAttribute('data-transparency')).toBe('off');
  });

  it('ignores a damaged stored value', async () => {
    localStorage.setItem('cn.glass', JSON.stringify({ color: 'plaid', strength: 900, transparency: 'maybe' }));
    vi.resetModules();
    const fresh = await import('./ui');
    expect(fresh.useUi.getState().glass).toEqual({ color: 'sky', strength: 100, transparency: true });
  });
});
