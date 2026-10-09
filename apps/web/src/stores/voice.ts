/**
 * Voice rooms (client): one call at a time, peer to peer with WebRTC.
 *
 * Layers (docs/VOICE.md): signalling goes through the existing Socket.IO connection
 * (lib/realtime.ts → onRoom/onSignal/onEnded here); media is one RTCPeerConnection per person
 * (lib/voice/peer.ts) with Opus tuned per mode (lib/voice/sdp.ts, lib/voice/media.ts); this store
 * holds the state the UI renders and nothing else. Levels are polled 10× a second only while in
 * a call; the microphone is released the moment the call ends.
 */
import type { VoiceJoinAck, VoicePeerDTO, VoiceRoomDTO, VoiceSignal } from '@creator-network/shared';
import { create } from 'zustand';
import { getSocket } from '../lib/realtime';
import { playSound } from '../lib/sounds';
import {
  canChooseOutput,
  LevelMeter,
  listAudioDevices,
  MicError,
  openMicrophone,
  opusParamsFor,
  SpeakingDetector,
  stopStream,
  toDb,
  type AudioDevices,
  type MicErrorCode,
  type VoiceMode,
} from '../lib/voice/media';
import { PeerLink, type LinkStats } from '../lib/voice/peer';

export type VoiceStatus = 'idle' | 'joining' | 'connected' | 'reconnecting';
export type VoiceErrorCode =
  MicErrorCode | 'offline' | 'timeout' | 'room_full' | 'not_allowed' | 'voice_disabled' | 'ended_elsewhere' | 'removed';

export interface VoiceSettings {
  mode: VoiceMode;
  inputId: string | null;
  outputId: string | null;
  /** Push to talk: the microphone only sends while the key is held. */
  ptt: boolean;
  /** KeyboardEvent.code of the push-to-talk key. */
  pttKey: string;
  /** Sensitivity gate: send only above `gateDb` (otherwise always, voice mode suppresses noise). */
  gate: boolean;
  gateDb: number;
}

export interface PeerView extends VoicePeerDTO {
  link: RTCPeerConnectionState;
  speaking: boolean;
}

interface VoiceState {
  status: VoiceStatus;
  channelId: string | null;
  peerId: string | null;
  peers: Record<string, PeerView>;
  /** Everyone in voice in the channels you can see (for sidebars and headers). */
  rooms: Record<string, VoicePeerDTO[]>;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  /** The microphone is actually sending (not muted, push-to-talk held, gate open). */
  transmitting: boolean;
  /** Your input level, 0–1 (for meters). */
  level: number;
  error: VoiceErrorCode | null;
  settings: VoiceSettings;
  devices: AudioDevices;
  /** Measured per connection (getStats), refreshed every 2 s during a call. */
  stats: Record<string, LinkStats>;

  join: (channelId: string) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setSettings: (patch: Partial<VoiceSettings>) => Promise<void>;
  refreshDevices: () => Promise<void>;
  setPushToTalk: (held: boolean) => void;
  clearError: () => void;

  onRoom: (room: VoiceRoomDTO) => void;
  onRooms: (rooms: VoiceRoomDTO[]) => void;
  onSignal: (payload: { channelId: string; from: string; signal: VoiceSignal }) => void;
  onEnded: (payload: { channelId: string; reason: 'elsewhere' | 'removed' | 'disabled' }) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  reset: () => void;
}

const SETTINGS_KEY = 'cn.voice';
const DEFAULT_SETTINGS: VoiceSettings = {
  mode: 'voice',
  inputId: null,
  outputId: null,
  ptt: false,
  pttKey: 'Backquote',
  gate: false,
  gateDb: -50,
};

function loadSettings(): VoiceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<VoiceSettings> | null;
    return { ...DEFAULT_SETTINGS, ...(raw ?? {}), mode: raw?.mode === 'studio' ? 'studio' : 'voice' };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// --- Media and connections (outside React state: they are not data to render) ---------------

let local: MediaStream | null = null;
/** A clone of the microphone track that is never disabled: the meter must hear you while muted. */
let meterStream: MediaStream | null = null;
let iceServers: RTCIceServer[] = [];
let maxBitrate = 320_000;
const links = new Map<string, PeerLink>();
const outputs = new Map<string, HTMLAudioElement>();
const remoteMeters = new Map<string, { meter: LevelMeter; detector: SpeakingDetector }>();
let localMeter: { meter: LevelMeter; detector: SpeakingDetector } | null = null;
let audio: AudioContext | null = null;
let levelTimer: number | null = null;
let statsTimer: number | null = null;
let pttHeld = false;
let gateOpen = true;
let gateQuietSince = 0;
let mutedBeforeDeafen = false;

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export const useVoice = create<VoiceState>((set, get) => {
  const emitState = () => {
    const { channelId, muted, deafened } = get();
    if (channelId) getSocket()?.emit('voice:state', { channelId, muted, deafened });
  };

  const applyTransmit = () => {
    const { muted, settings } = get();
    const on = !muted && (!settings.ptt || pttHeld) && (!settings.gate || gateOpen);
    for (const t of local?.getAudioTracks() ?? []) t.enabled = on;
    if (get().transmitting !== on) set({ transmitting: on });
  };

  const attachLocalMeter = () => {
    localMeter?.meter.dispose();
    stopStream(meterStream);
    const track = local?.getAudioTracks()[0];
    if (!audio || !track) return;
    meterStream = new MediaStream([track.clone()]);
    localMeter = { meter: new LevelMeter(audio, meterStream), detector: new SpeakingDetector() };
  };

  const dropLink = (peerId: string) => {
    links.get(peerId)?.close();
    links.delete(peerId);
    const el = outputs.get(peerId);
    if (el) {
      el.pause();
      el.srcObject = null;
      outputs.delete(peerId);
    }
    remoteMeters.get(peerId)?.meter.dispose();
    remoteMeters.delete(peerId);
  };

  const ensureLink = (remotePeerId: string): PeerLink | null => {
    const existing = links.get(remotePeerId);
    if (existing) return existing;
    const { peerId, channelId } = get();
    const track = local?.getAudioTracks()[0];
    if (!peerId || !channelId || !local || !track) return null;
    const link = new PeerLink({
      remotePeerId,
      polite: peerId > remotePeerId,
      iceServers,
      track,
      stream: local,
      send: (signal) => getSocket()?.emit('voice:signal', { channelId, to: remotePeerId, signal }),
      opus: () => opusParamsFor(get().settings.mode, maxBitrate),
      onRemoteStream: (stream) => {
        let el = outputs.get(remotePeerId);
        if (!el) {
          el = new Audio();
          el.autoplay = true;
          outputs.set(remotePeerId, el);
        }
        el.srcObject = stream;
        el.muted = get().deafened;
        const sink = get().settings.outputId;
        if (sink && canChooseOutput()) void el.setSinkId(sink).catch(() => undefined);
        void el.play().catch(() => undefined);
        if (audio && !remoteMeters.has(remotePeerId)) {
          remoteMeters.set(remotePeerId, { meter: new LevelMeter(audio, stream), detector: new SpeakingDetector() });
        }
      },
      onState: (state) => {
        const peer = get().peers[remotePeerId];
        if (peer && peer.link !== state) set({ peers: { ...get().peers, [remotePeerId]: { ...peer, link: state } } });
      },
    });
    links.set(remotePeerId, link);
    return link;
  };

  const tick = () => {
    const now = performance.now();
    if (localMeter) {
      const rms = localMeter.meter.read();
      const db = toDb(rms);
      const { settings } = get();
      if (settings.gate) {
        if (db >= settings.gateDb) {
          gateQuietSince = 0;
          if (!gateOpen) {
            gateOpen = true;
            applyTransmit();
          }
        } else if (gateOpen) {
          gateQuietSince ||= now;
          if (now - gateQuietSince > 400) {
            gateOpen = false;
            applyTransmit();
          }
        }
      }
      const speaking = localMeter.detector.update(db, now) && get().transmitting;
      const level = Math.min(1, rms * 4);
      if (speaking !== get().speaking || Math.abs(level - get().level) > 0.03) set({ speaking, level });
    }
    let changed = false;
    const peers = { ...get().peers };
    for (const [id, m] of remoteMeters) {
      const peer = peers[id];
      if (!peer) continue;
      const speaking = m.detector.update(toDb(m.meter.read()), now) && !get().deafened;
      if (peer.speaking !== speaking) {
        peers[id] = { ...peer, speaking };
        changed = true;
      }
    }
    if (changed) set({ peers });
  };

  const sampleStats = async () => {
    const out: Record<string, LinkStats> = {};
    for (const [id, link] of links) {
      try {
        out[id] = await link.stats();
      } catch {
        /* closed meanwhile */
      }
    }
    if (get().status !== 'idle') set({ stats: out });
  };

  const onKey = (e: KeyboardEvent) => {
    const { settings, status } = get();
    if (!settings.ptt || status === 'idle' || e.code !== settings.pttKey || e.repeat) return;
    // A printable key typed into a text field is text, not push-to-talk.
    if (isEditable(e.target) && e.key.length === 1) return;
    get().setPushToTalk(e.type === 'keydown');
  };
  const onBlur = () => get().setPushToTalk(false);

  const startLoops = () => {
    audio ??= new AudioContext();
    void audio.resume().catch(() => undefined);
    attachLocalMeter();
    levelTimer ??= window.setInterval(tick, 100);
    statsTimer ??= window.setInterval(() => void sampleStats(), 2000);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
  };

  const cleanupMedia = () => {
    for (const id of [...links.keys()]) dropLink(id);
    for (const [, el] of outputs) {
      el.pause();
      el.srcObject = null;
    }
    outputs.clear();
    localMeter?.meter.dispose();
    localMeter = null;
    stopStream(meterStream);
    stopStream(local);
    meterStream = null;
    local = null;
    if (levelTimer) window.clearInterval(levelTimer);
    if (statsTimer) window.clearInterval(statsTimer);
    levelTimer = null;
    statsTimer = null;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', onBlur);
    void audio?.close().catch(() => undefined);
    audio = null;
    pttHeld = false;
    gateOpen = true;
  };

  const endCall = (error: VoiceErrorCode | null) => {
    cleanupMedia();
    set({
      status: 'idle',
      channelId: null,
      peerId: null,
      peers: {},
      speaking: false,
      transmitting: false,
      level: 0,
      stats: {},
      error,
    });
  };

  /** Replaces the microphone (device or mode change) in every connection without hanging up. */
  const reopenMicrophone = async () => {
    const { settings } = get();
    const next = await openMicrophone(settings.mode, settings.inputId);
    const track = next.getAudioTracks()[0];
    if (!track || get().status === 'idle') {
      stopStream(next);
      return;
    }
    track.onended = () => void reopenMicrophone().catch(() => set({ error: 'not_found' }));
    for (const link of links.values()) await link.replaceTrack(track);
    stopStream(local);
    local = next;
    attachLocalMeter();
    applyTransmit();
  };

  const requestJoin = async (channelId: string, resumePeerId?: string): Promise<VoiceJoinAck | null> => {
    const socket = getSocket();
    if (!socket?.connected) return null;
    try {
      return await socket.timeout(10_000).emitWithAck('voice:join', { channelId, resumePeerId });
    } catch {
      return null;
    }
  };

  return {
    status: 'idle',
    channelId: null,
    peerId: null,
    peers: {},
    rooms: {},
    muted: false,
    deafened: false,
    speaking: false,
    transmitting: false,
    level: 0,
    error: null,
    settings: loadSettings(),
    devices: { inputs: [], outputs: [] },
    stats: {},

    join: async (channelId) => {
      const state = get();
      if (state.status !== 'idle' && state.channelId === channelId) return;
      if (state.status !== 'idle') get().leave();
      if (!getSocket()?.connected) {
        set({ error: 'offline' });
        return;
      }
      set({ status: 'joining', channelId, error: null, peers: {}, muted: false, deafened: false });
      try {
        local = await openMicrophone(get().settings.mode, get().settings.inputId);
      } catch (err) {
        endCall(err instanceof MicError ? err.code : 'failed');
        return;
      }
      if (get().channelId !== channelId) {
        stopStream(local);
        local = null;
        return;
      }
      const track = local.getAudioTracks()[0];
      if (track) track.onended = () => void reopenMicrophone().catch(() => set({ error: 'not_found' }));
      const ack = await requestJoin(channelId);
      if (get().channelId !== channelId) return; // left while joining
      if (!ack || !ack.ok) {
        const code = ack?.error.code;
        endCall(
          !ack
            ? 'timeout'
            : code === 'room_full' || code === 'voice_disabled'
              ? code
              : code === 'not_found' || code === 'forbidden' || code === 'dm_unavailable'
                ? 'not_allowed'
                : 'failed',
        );
        return;
      }
      iceServers = ack.iceServers;
      maxBitrate = ack.maxBitrate;
      set({ status: 'connected', peerId: ack.peerId });
      startLoops();
      applyTransmit();
      get().onRoom(ack.room);
      // The newcomer calls everyone already in the room.
      for (const p of ack.room.peers) if (p.peerId !== ack.peerId) ensureLink(p.peerId);
      playSound('voiceJoin');
      void get().refreshDevices();
    },

    leave: () => {
      const { channelId, status } = get();
      if (status === 'idle') return;
      if (channelId) getSocket()?.emit('voice:leave', { channelId });
      endCall(null);
      playSound('voiceLeave');
    },

    toggleMute: () => {
      const { muted, deafened } = get();
      if (deafened && muted) {
        set({ muted: false, deafened: false });
        for (const el of outputs.values()) el.muted = false;
      } else {
        set({ muted: !muted });
      }
      applyTransmit();
      emitState();
      playSound('click');
    },

    toggleDeafen: () => {
      const { deafened, muted } = get();
      if (!deafened) mutedBeforeDeafen = muted;
      const next = !deafened;
      set({ deafened: next, muted: next ? true : mutedBeforeDeafen });
      for (const el of outputs.values()) el.muted = next;
      applyTransmit();
      emitState();
      playSound('click');
    },

    setSettings: async (patch) => {
      const prev = get().settings;
      const settings = { ...prev, ...patch };
      set({ settings });
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* per-device convenience */
      }
      if (get().status === 'idle') return;
      if (patch.outputId !== undefined && canChooseOutput()) {
        for (const el of outputs.values()) await el.setSinkId(settings.outputId ?? '').catch(() => undefined);
      }
      if ((patch.mode && patch.mode !== prev.mode) || (patch.inputId !== undefined && patch.inputId !== prev.inputId)) {
        try {
          await reopenMicrophone();
        } catch (err) {
          set({ error: err instanceof MicError ? err.code : 'failed' });
        }
      }
      if (patch.mode && patch.mode !== prev.mode) {
        // Stereo and bitrate live in the SDP: renegotiate every connection.
        for (const link of links.values()) {
          await link.offer();
          await link.applyBitrate();
        }
      }
      if (patch.ptt !== undefined || patch.gate !== undefined) {
        gateOpen = true;
        applyTransmit();
      }
    },

    refreshDevices: async () => {
      try {
        set({ devices: await listAudioDevices() });
      } catch {
        /* keep the previous list */
      }
    },

    setPushToTalk: (held) => {
      if (pttHeld === held) return;
      pttHeld = held;
      applyTransmit();
    },

    clearError: () => set({ error: null }),

    onRoom: (room) => {
      const rooms = { ...get().rooms };
      if (room.peers.length) rooms[room.channelId] = room.peers;
      else delete rooms[room.channelId];
      set({ rooms });
      const { channelId, status, peerId } = get();
      if (status === 'idle' || room.channelId !== channelId) return;
      const before = get().peers;
      const peers: Record<string, PeerView> = {};
      for (const p of room.peers) {
        if (p.peerId === peerId) continue;
        const prev = before[p.peerId];
        peers[p.peerId] = { ...p, link: prev?.link ?? 'new', speaking: prev?.speaking ?? false };
      }
      const joined = Object.keys(peers).some((id) => !before[id]);
      const left = Object.keys(before).filter((id) => !peers[id]);
      for (const id of left) dropLink(id);
      set({ peers });
      if (status === 'connected' && Object.keys(before).length + Object.keys(peers).length > 0) {
        if (joined && Object.keys(before).length > 0) playSound('voiceJoin');
        if (left.length) playSound('voiceLeave');
      }
    },

    onRooms: (list) => {
      const rooms: Record<string, VoicePeerDTO[]> = {};
      for (const r of list) if (r.peers.length) rooms[r.channelId] = r.peers;
      set({ rooms });
    },

    onSignal: ({ channelId, from, signal }) => {
      const state = get();
      if (state.status === 'idle' || state.channelId !== channelId || from === state.peerId) return;
      // The server relays only between members of the same room: an unknown sender just joined.
      void ensureLink(from)
        ?.handle(signal)
        .catch(() => undefined);
    },

    onEnded: ({ channelId, reason }) => {
      if (get().channelId !== channelId) return;
      endCall(reason === 'elsewhere' ? 'ended_elsewhere' : reason === 'disabled' ? 'voice_disabled' : 'removed');
      playSound('voiceLeave');
    },

    onDisconnect: () => {
      // Media keeps flowing peer to peer; only the server link is being restored.
      if (get().status === 'connected') set({ status: 'reconnecting' });
    },

    onReconnect: () => {
      const socket = getSocket();
      socket?.emit('voice:rooms', {}, (rooms) => get().onRooms(rooms));
      const { status, channelId, peerId } = get();
      if ((status !== 'connected' && status !== 'reconnecting') || !channelId) return;
      void requestJoin(channelId, peerId ?? undefined).then((ack) => {
        if (get().channelId !== channelId) return;
        if (!ack || !ack.ok) {
          endCall(ack ? 'removed' : 'timeout');
          return;
        }
        iceServers = ack.iceServers;
        if (!ack.resumed) {
          // A new session: everyone has to be called again.
          for (const id of [...links.keys()]) dropLink(id);
          set({ peerId: ack.peerId, peers: {} });
          get().onRoom(ack.room);
          for (const p of ack.room.peers) if (p.peerId !== ack.peerId) ensureLink(p.peerId);
        } else {
          get().onRoom(ack.room);
        }
        set({ status: 'connected' });
        emitState();
      });
    },

    reset: () => {
      endCall(null);
      set({ rooms: {}, error: null });
    },
  };
});

if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    const state = useVoice.getState();
    void state.refreshDevices().then(() => {
      const { devices, settings, status } = useVoice.getState();
      // The chosen microphone was unplugged during a call: fall back to the default one.
      if (status !== 'idle' && settings.inputId && !devices.inputs.some((d) => d.id === settings.inputId)) {
        void useVoice.getState().setSettings({ inputId: null });
      }
    });
  });
}
