import { beforeEach, describe, expect, it } from 'vitest';
import { useDesktop } from './desktop';

beforeEach(() => {
  localStorage.clear();
  useDesktop.setState({ maximized: false, minimized: false, modals: 0 });
});

describe('desktop window', () => {
  it('remembers a maximised window on this device and brings a minimised one back', () => {
    useDesktop.getState().setMinimized(true);
    useDesktop.getState().toggleMaximized();
    expect(useDesktop.getState()).toMatchObject({ maximized: true, minimized: false });
    expect(localStorage.getItem('cn.window')).toBe('maximized');
    useDesktop.getState().toggleMaximized();
    expect(localStorage.getItem('cn.window')).toBe('normal');
  });

  it('counts the dialogs that are open and never goes below zero', () => {
    const desktop = useDesktop.getState();
    desktop.modalOpened();
    desktop.modalOpened();
    expect(useDesktop.getState().modals).toBe(2);
    desktop.modalClosed();
    desktop.modalClosed();
    desktop.modalClosed();
    expect(useDesktop.getState().modals).toBe(0);
  });
});
