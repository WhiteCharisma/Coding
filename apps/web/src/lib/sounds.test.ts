import { describe, expect, it, vi } from 'vitest';
import { LEVEL, RECIPES, type SoundName } from './sound-recipes';
import { createSoundEngine, volumeGain, type SoundPrefs } from './sounds';

class FakeGain {
  gain = { value: 0 };
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  gains: FakeGain[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

function setup(prefs: SoundPrefs = { ui: { enabled: true, volume: 50 }, notify: { enabled: true, volume: 80 } }) {
  let clock = 1000;
  const ctx = new FakeContext();
  const played: SoundName[] = [];
  const recipes = Object.fromEntries(
    (Object.keys(RECIPES) as SoundName[]).map((name) => [
      name,
      () => {
        played.push(name);
        return 0.1;
      },
    ]),
  ) as unknown as typeof RECIPES;
  const current = { prefs };
  const engine = createSoundEngine({
    prefs: () => current.prefs,
    createContext: () => ctx as unknown as AudioContext,
    now: () => clock,
    recipes,
  });
  return {
    engine,
    ctx,
    played,
    current,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('interface sounds', () => {
  it('stays silent until the page has been interacted with', () => {
    const s = setup();
    expect(s.engine.play('send')).toBe(false);
    s.engine.unlock();
    expect(s.engine.play('send')).toBe(true);
    expect(s.played).toEqual(['send']);
  });

  it('plays a sound once even when it is requested twice in a row (optimistic + confirmed)', () => {
    const s = setup();
    s.engine.unlock();
    expect(s.engine.play('reaction')).toBe(true);
    expect(s.engine.play('reaction')).toBe(false);
    expect(s.engine.play('send')).toBe(true); // other sounds are not blocked
    s.advance(200);
    expect(s.engine.play('reaction')).toBe(true);
    // A burst of received messages gives one chime.
    expect(s.engine.play('receive')).toBe(true);
    s.advance(600);
    expect(s.engine.play('receive')).toBe(false);
    expect(s.played).toEqual(['reaction', 'send', 'reaction', 'receive']);
  });

  it('routes notification sounds and interface sounds to their own switch and volume', () => {
    const s = setup({ ui: { enabled: false, volume: 50 }, notify: { enabled: true, volume: 80 } });
    s.engine.unlock();
    expect(s.engine.play('receive')).toBe(false);
    expect(s.engine.play('notification')).toBe(true);
    expect(s.ctx.gains.at(-1)?.gain.value).toBeCloseTo(LEVEL.notification * volumeGain(80));

    s.current.prefs = { ui: { enabled: true, volume: 0 }, notify: { enabled: false, volume: 80 } };
    s.advance(5000);
    expect(s.engine.play('click')).toBe(false); // volume 0
    expect(s.engine.play('notification')).toBe(false); // switched off
  });

  it('plays the first sound of a gesture once the audio has started', async () => {
    const s = setup();
    s.engine.unlock();
    s.ctx.state = 'suspended'; // created by this gesture, not running yet
    const resume = vi.spyOn(s.ctx, 'resume');
    expect(s.engine.play('success')).toBe(true);
    expect(resume).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.played).toEqual(['success']);
  });

  it('maps the volume slider to a perceptual gain', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(50)).toBeCloseTo(0.25);
    expect(volumeGain(100)).toBe(1);
    expect(volumeGain(140)).toBe(1);
  });
});
