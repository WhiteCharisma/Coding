/**
 * Creator Network interface sounds, synthesised with the Web Audio API.
 *
 * Every sound is original: small glassy bells, soft bubbles and airy whooshes built from sine and
 * triangle oscillators, inharmonic "glass" partials and filtered noise. No recordings, samples or
 * third-party assets are used, so there is nothing to license.
 *
 * Each recipe schedules its notes on `out` starting at `t` and returns its length in seconds.
 * LEVEL (below) equalises their loudness; it was measured by rendering every recipe offline and
 * matching their short-term RMS (docs/DESIGN.md → Sound).
 */

export type SoundName =
  | 'send'
  | 'receive'
  | 'notification'
  | 'click'
  | 'open'
  | 'reaction'
  | 'voiceJoin'
  | 'voiceLeave'
  | 'uploadDone'
  | 'success';

type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number) => number;

interface ToneOptions {
  freq: number;
  /** Glide to this frequency over the attack + a short time (exponential). */
  glideTo?: number;
  glideTime?: number;
  type?: OscillatorType;
  attack?: number;
  decay: number;
  gain: number;
  detune?: number;
}

function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: ToneOptions): number {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideTime ?? 0.08));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const attack = o.attack ?? 0.004;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.02);
  return attack + o.decay;
}

/** A small glass bell: a fundamental plus two inharmonic partials that fade faster. */
function bell(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, gain: number, decay = 0.5): number {
  tone(ctx, out, t, { freq, decay, gain, attack: 0.003 });
  tone(ctx, out, t, { freq: freq * 2.76, decay: decay * 0.45, gain: gain * 0.28, attack: 0.002 });
  tone(ctx, out, t, { freq: freq * 5.4, decay: decay * 0.2, gain: gain * 0.1, attack: 0.001 });
  // A slightly detuned twin gives the glass a gentle shimmer.
  tone(ctx, out, t, { freq, decay: decay * 0.8, gain: gain * 0.25, detune: 7, attack: 0.006 });
  return decay;
}

/** Breath of filtered noise sweeping between two frequencies (a soft "whoosh"). */
function whoosh(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  o: { from: number; to: number; duration: number; gain: number },
): number {
  const length = Math.ceil(ctx.sampleRate * o.duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic noise (same sound every time, and testable).
  let seed = 0x2f6b1d;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 0x80000000 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(o.from, t);
  filter.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.gain, t + o.duration * 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
  src.stop(t + o.duration + 0.02);
  return o.duration;
}

// Notes (Hz).
const G5 = 783.99;
const C6 = 1046.5;
const D6 = 1174.66;
const E6 = 1318.51;
const G6 = 1567.98;
const A4 = 440;
const E5 = 659.25;

export const RECIPES: Record<SoundName, Recipe> = {
  /** Message sent: a light upward whoosh with a soft rising blip. */
  send: (ctx, out, t) => {
    whoosh(ctx, out, t, { from: 900, to: 3400, duration: 0.16, gain: 0.5 });
    tone(ctx, out, t + 0.02, { freq: 660, glideTo: 990, glideTime: 0.07, decay: 0.12, gain: 0.32 });
    return 0.18;
  },
  /** Message received in the conversation you are reading: two glassy notes. */
  receive: (ctx, out, t) => {
    bell(ctx, out, t, C6, 0.42, 0.45);
    bell(ctx, out, t + 0.075, G6, 0.34, 0.5);
    return 0.58;
  },
  /** Mention, reply or direct message while you are elsewhere: a bright three-note rise. */
  notification: (ctx, out, t) => {
    bell(ctx, out, t, G5, 0.4, 0.55);
    bell(ctx, out, t + 0.085, D6, 0.34, 0.6);
    bell(ctx, out, t + 0.17, G6, 0.3, 0.75);
    return 0.92;
  },
  /** Navigation and toggles: a tiny glass tick. */
  click: (ctx, out, t) => tone(ctx, out, t, { freq: 2100, type: 'triangle', attack: 0.001, decay: 0.035, gain: 0.3 }),
  /** Opening a conversation: a soft bubble with a faint sparkle. */
  open: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 520, glideTo: 780, glideTime: 0.05, decay: 0.12, gain: 0.42 });
    bell(ctx, out, t + 0.03, G6, 0.08, 0.25);
    return 0.28;
  },
  /** A reaction: two quick rising "plips", like a bubble surfacing. */
  reaction: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 900, glideTo: 1700, glideTime: 0.05, decay: 0.09, gain: 0.36 });
    tone(ctx, out, t + 0.055, { freq: 1300, glideTo: 2200, glideTime: 0.04, decay: 0.08, gain: 0.24 });
    return 0.15;
  },
  /** Joining a voice channel: a warm rising pair with a glint on top. */
  voiceJoin: (ctx, out, t) => {
    tone(ctx, out, t, { freq: A4, type: 'triangle', attack: 0.02, decay: 0.32, gain: 0.34 });
    tone(ctx, out, t + 0.09, { freq: E5, type: 'triangle', attack: 0.02, decay: 0.42, gain: 0.3 });
    bell(ctx, out, t + 0.12, E6, 0.08, 0.35);
    return 0.55;
  },
  /** Leaving a voice channel: the same pair, falling. */
  voiceLeave: (ctx, out, t) => {
    tone(ctx, out, t, { freq: E5, type: 'triangle', attack: 0.02, decay: 0.3, gain: 0.32 });
    tone(ctx, out, t + 0.09, { freq: A4, type: 'triangle', attack: 0.02, decay: 0.4, gain: 0.3 });
    return 0.5;
  },
  /** An upload finished: one clear glass ding. */
  uploadDone: (ctx, out, t) => {
    bell(ctx, out, t, E6, 0.4, 0.6);
    tone(ctx, out, t + 0.01, { freq: E6 * 2, decay: 0.25, gain: 0.06 });
    return 0.62;
  },
  /** Something worked (saved, created, joined): a bright major third. */
  success: (ctx, out, t) => {
    bell(ctx, out, t, C6, 0.3, 0.45);
    bell(ctx, out, t + 0.03, E6, 0.26, 0.5);
    return 0.55;
  },
};

/**
 * Loudness trims (linear gain) so every sound plays at the same short-term loudness at the same
 * volume setting. Measured with scripts/sound-levels.mjs (renders each recipe offline).
 */
export const LEVEL: Record<SoundName, number> = {
  send: 0.6,
  receive: 0.252,
  notification: 0.247,
  // The click stays 6 dB under the rest: it accompanies frequent actions.
  click: 0.8,
  open: 0.495,
  reaction: 0.671,
  voiceJoin: 0.473,
  voiceLeave: 0.504,
  uploadDone: 0.248,
  success: 0.285,
};
