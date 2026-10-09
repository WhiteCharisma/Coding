import type { OpusParams } from './sdp';

/**
 * Voice: for talking. Echo cancellation, noise suppression and automatic gain are on, which
 * makes the browser capture mono; sent as Opus mono at up to 64 kbit/s.
 * Studio: for music. All processing off (it would colour and narrow the sound), stereo capture,
 * sent as Opus stereo at a constant 320 kbit/s (or the server's lower limit). Use headphones:
 * without echo cancellation the others would hear themselves through your speakers.
 */
export type VoiceMode = 'voice' | 'studio';

export const MODE_BITRATE: Record<VoiceMode, number> = { voice: 64_000, studio: 320_000 };

export function opusParamsFor(mode: VoiceMode, serverMax: number): OpusParams {
  return mode === 'studio'
    ? {
        stereo: true,
        maxAverageBitrate: Math.min(MODE_BITRATE.studio, serverMax),
        cbr: true,
        useInbandFec: true,
        useDtx: false,
      }
    : {
        stereo: false,
        maxAverageBitrate: Math.min(MODE_BITRATE.voice, serverMax),
        cbr: false,
        useInbandFec: true,
        useDtx: false,
      };
}

export function captureConstraints(mode: VoiceMode, deviceId: string | null): MediaTrackConstraints {
  const device: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : {};
  return mode === 'studio'
    ? {
        ...device,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48_000 },
      }
    : {
        ...device,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48_000 },
      };
}

export type MicErrorCode = 'denied' | 'not_found' | 'busy' | 'insecure' | 'unsupported' | 'failed';

export class MicError extends Error {
  constructor(
    readonly code: MicErrorCode,
    cause?: unknown,
  ) {
    super(code, { cause });
  }
}

/** Opens the microphone; a chosen device that disappeared falls back to the default one. */
export async function openMicrophone(mode: VoiceMode, deviceId: string | null): Promise<MediaStream> {
  if (!window.isSecureContext) throw new MicError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new MicError('unsupported');
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: captureConstraints(mode, deviceId), video: false });
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) return openMicrophone(mode, null);
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied', err);
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('not_found', err);
    if (name === 'NotReadableError' || name === 'AbortError') throw new MicError('busy', err);
    throw new MicError('failed', err);
  }
}

/** Stops every track: the browser's "microphone in use" indicator goes away. */
export function stopStream(stream: MediaStream | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export interface AudioDevices {
  inputs: { id: string; label: string }[];
  outputs: { id: string; label: string }[];
}

/** Lists microphones and speakers (labels appear once microphone access was granted). */
export async function listAudioDevices(): Promise<AudioDevices> {
  const all = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  const pick = (kind: MediaDeviceKind) =>
    all
      .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'communications')
      .map((d, i) => ({
        id: d.deviceId,
        label: d.label || `${kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}`,
      }));
  return { inputs: pick('audioinput'), outputs: pick('audiooutput') };
}

/** Whether this browser lets the page choose the speaker (HTMLMediaElement.setSinkId). */
export const canChooseOutput = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/**
 * Loudness of a stream, read on demand (no animation loop of its own): RMS of the latest
 * samples, 0–1. Used for the level meters, speaking indicators and the sensitivity gate.
 */
export class LevelMeter {
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly buffer: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext, stream: MediaStream) {
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
  }

  read(): number {
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const v of this.buffer) sum += v * v;
    return Math.sqrt(sum / this.buffer.length);
  }

  dispose(): void {
    this.source.disconnect();
    this.analyser.disconnect();
  }
}

/** RMS level → dBFS (−100 for silence). */
export const toDb = (rms: number): number => (rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100);

/**
 * Speaking detection with hysteresis: on above `onDb`, off after `holdMs` below `offDb`.
 * Prevents flicker between words.
 */
export class SpeakingDetector {
  private speaking = false;
  private quietSince = 0;

  constructor(
    private readonly onDb = -45,
    private readonly offDb = -52,
    private readonly holdMs = 350,
  ) {}

  update(db: number, now: number): boolean {
    if (db >= this.onDb) {
      this.speaking = true;
      this.quietSince = 0;
    } else if (this.speaking && db < this.offDb) {
      if (!this.quietSince) this.quietSince = now;
      if (now - this.quietSince >= this.holdMs) this.speaking = false;
    } else {
      this.quietSince = 0;
    }
    return this.speaking;
  }
}
