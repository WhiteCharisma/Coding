/**
 * Interface sounds: plays the original synthesised sounds of sound-recipes.ts.
 *
 * - Two independent channels, each with its own switch and volume (Settings → Notifications,
 *   stored per device): "interface" (sent, received in the open conversation, reactions, clicks,
 *   opening a conversation, voice, uploads, success) and "notifications" (mentions, replies and
 *   direct messages while you are elsewhere).
 * - Browsers only allow audio after the person interacts with the page: the audio context is
 *   created/resumed on the first pointer or key press. Until then nothing plays (no errors).
 * - The same sound never plays twice in quick succession: an unsent message and its server
 *   confirmation, or a burst of messages, give one sound.
 */
import { useSyncExternalStore } from 'react';
import { LEVEL, RECIPES, type SoundName } from './sound-recipes';

export type { SoundName };
export type SoundChannel = 'ui' | 'notify';

export interface SoundPref {
  enabled: boolean;
  /** 0–100 */
  volume: number;
}
export type SoundPrefs = Record<SoundChannel, SoundPref>;

export const SOUND_CHANNEL: Record<SoundName, SoundChannel> = {
  send: 'ui',
  receive: 'ui',
  notification: 'notify',
  click: 'ui',
  open: 'ui',
  reaction: 'ui',
  voiceJoin: 'ui',
  voiceLeave: 'ui',
  uploadDone: 'ui',
  success: 'ui',
};

/** Shortest gap between two plays of the same sound, in ms. */
const MIN_GAP: Partial<Record<SoundName, number>> = {
  receive: 1200,
  notification: 1500,
  uploadDone: 400,
  click: 50,
};
const DEFAULT_GAP = 150;

interface EngineDeps {
  prefs: () => SoundPrefs;
  createContext: () => AudioContext | null;
  now: () => number;
  recipes?: typeof RECIPES;
}

export interface SoundEngine {
  /** Plays a sound if its channel is on, audio is unlocked and it did not just play. */
  play: (name: SoundName) => boolean;
  /** Call from a user gesture: creates or resumes the audio context. */
  unlock: () => void;
}

/** Perceived loudness grows roughly with the square of the slider position. */
export const volumeGain = (volume: number) => (Math.max(0, Math.min(100, volume)) / 100) ** 2;

export function createSoundEngine({ prefs, createContext, now, recipes = RECIPES }: EngineDeps): SoundEngine {
  let ctx: AudioContext | null = null;
  const lastPlayed = new Map<SoundName, number>();
  return {
    unlock: () => {
      try {
        ctx ??= createContext();
        if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
      } catch {
        /* audio unavailable: stay silent */
      }
    },
    play: (name) => {
      const pref = prefs()[SOUND_CHANNEL[name]];
      const audio = ctx;
      if (!pref.enabled || pref.volume <= 0 || !audio || audio.state === 'closed') return false;
      const at = now();
      const last = lastPlayed.get(name);
      if (last !== undefined && at - last < (MIN_GAP[name] ?? DEFAULT_GAP)) return false;
      lastPlayed.set(name, at);
      const start = () => {
        try {
          const out = audio.createGain();
          out.gain.value = LEVEL[name] * volumeGain(pref.volume);
          out.connect(audio.destination);
          const length = recipes[name](audio, out, audio.currentTime + 0.01);
          window.setTimeout(() => out.disconnect(), (length + 0.3) * 1000);
        } catch {
          /* a broken audio device must never break the app */
        }
      };
      if (audio.state === 'running') {
        start();
        return true;
      }
      // Unlocked by this very gesture and still starting up: play as soon as it runs (late sounds
      // are dropped). Never unlocked: resume() is refused and nothing plays.
      void audio
        .resume()
        .then(() => {
          if (audio.state === 'running' && now() - at < 400) start();
        })
        .catch(() => undefined);
      return true;
    },
  };
}

// --- The app's engine -------------------------------------------------------------------------

const DEFAULT_PREFS: SoundPrefs = { ui: { enabled: true, volume: 50 }, notify: { enabled: true, volume: 70 } };
const KEY: Record<SoundChannel, string> = { ui: 'cn.sound.ui', notify: 'cn.sound.notify' };

function readPref(channel: SoundChannel): SoundPref {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY[channel]) ?? 'null') as Partial<SoundPref> | null;
    if (!raw) return DEFAULT_PREFS[channel];
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_PREFS[channel].enabled,
      volume:
        typeof raw.volume === 'number'
          ? Math.max(0, Math.min(100, Math.round(raw.volume)))
          : DEFAULT_PREFS[channel].volume,
    };
  } catch {
    return DEFAULT_PREFS[channel];
  }
}

let current: SoundPrefs = { ui: readPref('ui'), notify: readPref('notify') };
const listeners = new Set<() => void>();

export function getSoundPrefs(): SoundPrefs {
  return current;
}

export function setSoundPref(channel: SoundChannel, patch: Partial<SoundPref>): void {
  current = { ...current, [channel]: { ...current[channel], ...patch } };
  try {
    localStorage.setItem(KEY[channel], JSON.stringify(current[channel]));
  } catch {
    /* per-device convenience only */
  }
  for (const l of listeners) l();
}

export function subscribeSoundPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The sound settings, kept in sync in React components. */
export const useSoundPrefs = (): SoundPrefs => useSyncExternalStore(subscribeSoundPrefs, getSoundPrefs);

const engine = createSoundEngine({
  prefs: getSoundPrefs,
  createContext: () =>
    typeof window.AudioContext === 'function' ? new window.AudioContext({ latencyHint: 'interactive' }) : null,
  now: () => performance.now(),
});

export const playSound = (name: SoundName): boolean => engine.play(name);

/** Unlocks audio on every user gesture (cheap; also resumes audio a phone suspended). */
export function installAudioUnlock(): void {
  const unlock = () => engine.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
}
