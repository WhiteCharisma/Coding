import { seededRandom } from './art';

/**
 * Tiny additive synthesizer that renders short, original music loops as 16-bit
 * mono WAV files for the demo content (audio preview cards with waveforms).
 */
export interface TrackSpec {
  bpm: number;
  chords: number[][]; // one chord (MIDI notes) per bar
  melody?: (number | null)[]; // eighth notes
  style: 'downtempo' | 'lofi' | 'musicbox' | 'synthwave';
  seed: string;
}

export interface RenderedTrack {
  wav: Buffer;
  peaks: number[];
  durationMs: number;
}

const SR = 22050;
const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function synthesize(spec: TrackSpec, peakCount = 96): RenderedTrack {
  const rnd = seededRandom(spec.seed);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const bars = spec.chords.length;
  const total = bars * bar + 1.2;
  const n = Math.ceil(total * SR);
  const out = new Float32Array(n);

  const add = (start: number, dur: number, fn: (t: number) => number) => {
    const s = Math.max(0, Math.floor(start * SR));
    const e = Math.min(n, Math.floor((start + dur) * SR));
    for (let i = s; i < e; i++) out[i] = (out[i] as number) + fn((i - s) / SR);
  };

  // Pads: one chord per bar with slow attack and overlapping release.
  const harmonics = spec.style === 'synthwave' ? 7 : 4;
  spec.chords.forEach((chord, b) => {
    const start = b * bar;
    const dur = bar + 0.6;
    for (const note of chord) {
      const f = midiToFreq(note);
      const gain = (spec.style === 'musicbox' ? 0.05 : 0.11) / chord.length;
      add(start, dur, (t) => {
        const env = Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (dur - t) / 0.6));
        let v = 0;
        for (let h = 1; h <= harmonics; h++) {
          const amp = spec.style === 'synthwave' ? 1 / h : 1 / h ** 1.7;
          v += amp * (Math.sin(2 * Math.PI * f * h * t) + Math.sin(2 * Math.PI * f * 1.004 * h * t + h));
        }
        const wobble = spec.style === 'lofi' ? 1 + 0.004 * Math.sin(2 * Math.PI * 0.7 * t) : 1;
        return v * env * gain * wobble;
      });
    }
    // Bass on beats 1 and 3 (eighths for synthwave).
    const root = (chord[0] as number) - 24;
    const hits = spec.style === 'synthwave' ? 8 : spec.style === 'musicbox' ? 1 : 2;
    for (let k = 0; k < hits; k++) {
      const f = midiToFreq(root);
      add(start + (k * bar) / hits, (bar / hits) * 0.95, (t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 3) * 0.32);
    }
  });

  // Drums.
  if (spec.style !== 'musicbox') {
    const beatsTotal = bars * 4;
    for (let k = 0; k < beatsTotal; k++) {
      const t0 = k * beat;
      const isKick = spec.style === 'synthwave' || k % 2 === 0;
      if (isKick) {
        add(t0, 0.35, (t) => {
          const phase = 2 * Math.PI * (45 * t + (65 / 18) * (1 - Math.exp(-t * 18)));
          return Math.sin(phase) * Math.exp(-t * 9) * 0.55;
        });
      }
      if (k % 2 === 1) {
        add(t0, 0.25, (t) => ((rnd() * 2 - 1) * Math.exp(-t * 20) * 0.22 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 28) * 0.12) * (spec.style === 'lofi' ? 0.7 : 1));
      }
      let last = 0;
      add(t0 + beat / 2, 0.06, (t) => {
        const noise = rnd() * 2 - 1;
        const hp = noise - last;
        last = noise;
        return hp * Math.exp(-t * 70) * 0.07;
      });
    }
  }

  // Melody.
  if (spec.melody) {
    spec.melody.forEach((note, i) => {
      if (note === null) return;
      const f = midiToFreq(note);
      const box = spec.style === 'musicbox';
      add(i * (beat / 2), 1.6, (t) => {
        const env = Math.exp(-t * (box ? 3 : 4.5)) * Math.min(1, t / 0.004);
        const tone = Math.sin(2 * Math.PI * f * t) + (box ? 0.25 * Math.sin(2 * Math.PI * f * 2.76 * t) : 0.2 * Math.sin(4 * Math.PI * f * t));
        return tone * env * (box ? 0.2 : 0.12);
      });
    });
  }

  // Lo-fi crackle.
  if (spec.style === 'lofi') {
    for (let i = 0; i < n; i++) if (rnd() < 0.0004) out[i] = (out[i] as number) + (rnd() - 0.5) * 0.3;
  }

  // Gentle low-pass, normalise, fade.
  const alpha = spec.style === 'lofi' ? 0.35 : 0.6;
  let prev = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    prev = prev + alpha * ((out[i] as number) - prev);
    out[i] = prev;
    peak = Math.max(peak, Math.abs(prev));
  }
  const norm = peak > 0 ? 0.89 / peak : 1;
  const fadeIn = Math.floor(0.02 * SR);
  const fadeOut = Math.floor(0.6 * SR);
  for (let i = 0; i < n; i++) {
    let g = norm;
    if (i < fadeIn) g *= i / fadeIn;
    if (i > n - fadeOut) g *= (n - i) / fadeOut;
    out[i] = (out[i] as number) * g;
  }

  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] as number)) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);

  const peaks: number[] = [];
  const bucket = Math.floor(n / peakCount);
  for (let p = 0; p < peakCount; p++) {
    let m = 0;
    for (let i = p * bucket; i < (p + 1) * bucket; i++) m = Math.max(m, Math.abs(out[i] as number));
    peaks.push(Math.round(Math.sqrt(m) * 100));
  }
  return { wav: Buffer.concat([header, data]), peaks, durationMs: Math.round((n / SR) * 1000) };
}
