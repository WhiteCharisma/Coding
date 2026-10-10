import { beforeEach, describe, expect, it } from 'vitest';
import { useScene } from './scene';

beforeEach(() => {
  useScene.setState({ modals: 0 });
});

describe('scene', () => {
  it('counts the dialogs that are open and never goes below zero', () => {
    const scene = useScene.getState();
    scene.modalOpened();
    scene.modalOpened();
    expect(useScene.getState().modals).toBe(2);
    scene.modalClosed();
    scene.modalClosed();
    scene.modalClosed();
    expect(useScene.getState().modals).toBe(0);
  });
});
