import { create } from 'zustand';

/**
 * One shared <audio> element: starting a track pauses the previous one.
 * Audio files are only downloaded when the user presses play (preload="none").
 */
interface PlayerState {
  src: string | null;
  playing: boolean;
  current: number;
  duration: number;
  error: string | null;
}

export const usePlayer = create<PlayerState>(() => ({
  src: null,
  playing: false,
  current: 0,
  duration: 0,
  error: null,
}));

let audio: HTMLAudioElement | null = null;

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('timeupdate', () => usePlayer.setState({ current: audio?.currentTime ?? 0 }));
  audio.addEventListener('durationchange', () => {
    const d = audio?.duration ?? 0;
    if (Number.isFinite(d)) usePlayer.setState({ duration: d });
  });
  audio.addEventListener('play', () => usePlayer.setState({ playing: true, error: null }));
  audio.addEventListener('pause', () => usePlayer.setState({ playing: false }));
  audio.addEventListener('ended', () => usePlayer.setState({ playing: false, current: 0 }));
  audio.addEventListener('error', () => usePlayer.setState({ playing: false, error: 'unsupported' }));
  return audio;
}

export function togglePlay(src: string, durationHintSec = 0): void {
  const el = element();
  const state = usePlayer.getState();
  if (state.src === src) {
    if (el.paused) void el.play().catch(() => usePlayer.setState({ playing: false }));
    else el.pause();
    return;
  }
  el.pause();
  el.src = src;
  usePlayer.setState({ src, playing: false, current: 0, duration: durationHintSec, error: null });
  void el.play().catch(() => usePlayer.setState({ playing: false }));
}

export function seekTo(src: string, fraction: number, durationHintSec = 0): void {
  const el = element();
  if (usePlayer.getState().src !== src) {
    togglePlay(src, durationHintSec);
  }
  const apply = () => {
    const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : durationHintSec;
    if (d > 0) el.currentTime = Math.max(0, Math.min(d, fraction * d));
  };
  if (el.readyState >= 1) apply();
  else el.addEventListener('loadedmetadata', apply, { once: true });
}

export function stopPlayback(): void {
  audio?.pause();
  usePlayer.setState({ src: null, playing: false, current: 0 });
}

/**
 * Computes waveform peaks (0–100) for an audio file in the browser before upload,
 * so every listener sees the waveform without downloading the file.
 */
export async function computePeaks(file: File, count = 96): Promise<{ peaks: number[]; durationMs: number } | null> {
  if (file.size > 60 * 1024 * 1024 || typeof OfflineAudioContext === 'undefined') return null;
  try {
    const data = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(data);
    const samples = buffer.getChannelData(0);
    const bucket = Math.max(1, Math.floor(samples.length / count));
    const peaks: number[] = [];
    for (let p = 0; p < count; p++) {
      let max = 0;
      const start = p * bucket;
      const end = Math.min(samples.length, start + bucket);
      for (let i = start; i < end; i += 4) {
        const v = Math.abs(samples[i] ?? 0);
        if (v > max) max = v;
      }
      peaks.push(Math.round(Math.sqrt(Math.min(1, max)) * 100));
    }
    return { peaks, durationMs: Math.round(buffer.duration * 1000) };
  } catch {
    return null;
  }
}
