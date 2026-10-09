import type { VoiceSignal } from '@creator-network/shared';
import { tuneOpus, type OpusParams } from './sdp';

export interface PeerLinkOptions {
  /** The other person's voice session. */
  remotePeerId: string;
  /** Perfect negotiation: the polite side yields when both make an offer at once. */
  polite: boolean;
  iceServers: RTCIceServer[];
  track: MediaStreamTrack;
  stream: MediaStream;
  send: (signal: VoiceSignal) => void;
  opus: () => OpusParams;
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: RTCPeerConnectionState) => void;
}

/** What getStats() says about one connection, measured (not configured) values. */
export interface LinkStats {
  /** Bits per second actually sent / received since the previous sample. */
  sendBitrate: number | null;
  receiveBitrate: number | null;
  codec: string | null;
  channels: number | null;
  fmtp: string | null;
  roundTripMs: number | null;
  jitterMs: number | null;
  /** Fraction of incoming packets lost since the previous sample (0–1). */
  loss: number | null;
  /** "host", "srflx" (via STUN) or "relay" (via TURN) for the active route. */
  route: string | null;
}

/**
 * One WebRTC connection to another person in the room (audio only, peer to peer).
 * Uses the "perfect negotiation" pattern so either side may renegotiate at any time, writes the
 * Opus settings of the current mode into every offer/answer, caps the sender's bitrate, and
 * restarts ICE when the network path fails.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswer = false;
  private closed = false;
  private last: { at: number; sent: number; received: number; lost: number; packets: number } | null = null;

  constructor(private readonly o: PeerLinkOptions) {
    this.pc = new RTCPeerConnection({ iceServers: o.iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    this.pc.addTrack(o.track, o.stream);
    this.pc.onnegotiationneeded = () => void this.offer();
    this.pc.onicecandidate = ({ candidate }) =>
      o.send({
        candidate: candidate
          ? {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
              usernameFragment: candidate.usernameFragment,
            }
          : null,
      });
    this.pc.ontrack = ({ streams, track }) => o.onRemoteStream(streams[0] ?? new MediaStream([track]));
    this.pc.onconnectionstatechange = () => {
      o.onState(this.pc.connectionState);
      if (this.pc.connectionState === 'failed') this.pc.restartIce();
    };
  }

  /** Makes an offer now (also used to apply a new mode: stereo, bitrate). */
  async offer(): Promise<void> {
    if (this.closed) return;
    try {
      this.makingOffer = true;
      const offer = await this.pc.createOffer();
      if (this.pc.signalingState !== 'stable' || this.closed) return;
      await this.pc.setLocalDescription({ type: 'offer', sdp: tuneOpus(offer.sdp ?? '', this.o.opus()) });
      this.o.send({ description: { type: 'offer', sdp: this.pc.localDescription?.sdp ?? '' } });
    } catch {
      /* the next negotiationneeded or the remote offer will try again */
    } finally {
      this.makingOffer = false;
    }
  }

  async handle(signal: VoiceSignal): Promise<void> {
    if (this.closed) return;
    if ('description' in signal) {
      const description = signal.description;
      const readyForOffer = !this.makingOffer && (this.pc.signalingState === 'stable' || this.settingRemoteAnswer);
      const collision = description.type === 'offer' && !readyForOffer;
      this.ignoreOffer = !this.o.polite && collision;
      if (this.ignoreOffer) return;
      this.settingRemoteAnswer = description.type === 'answer';
      await this.pc.setRemoteDescription(description); // a polite collision rolls back implicitly
      this.settingRemoteAnswer = false;
      if (description.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription({ type: 'answer', sdp: tuneOpus(answer.sdp ?? '', this.o.opus()) });
        this.o.send({ description: { type: 'answer', sdp: this.pc.localDescription?.sdp ?? '' } });
      }
      await this.applyBitrate();
    } else {
      try {
        await this.pc.addIceCandidate(signal.candidate ?? undefined);
      } catch (err) {
        if (!this.ignoreOffer) throw err;
      }
    }
  }

  /** Caps what we send (the encoder also follows the other side's maxaveragebitrate). */
  async applyBitrate(): Promise<void> {
    const max = this.o.opus().maxAverageBitrate;
    for (const sender of this.pc.getSenders()) {
      if (sender.track?.kind !== 'audio') continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0]!.maxBitrate = max;
      params.encodings[0]!.priority = 'high';
      params.encodings[0]!.networkPriority = 'high';
      await sender.setParameters(params).catch(() => undefined);
    }
  }

  /** Switches microphone without renegotiating (device change). */
  async replaceTrack(track: MediaStreamTrack): Promise<void> {
    for (const sender of this.pc.getSenders())
      if (sender.track?.kind === 'audio' || !sender.track) await sender.replaceTrack(track);
  }

  async stats(): Promise<LinkStats> {
    const report = await this.pc.getStats();
    let sent = 0;
    let received = 0;
    let lost = 0;
    let packets = 0;
    let codecId: string | null = null;
    let jitter: number | null = null;
    let rtt: number | null = null;
    let route: string | null = null;
    const codecs = new Map<string, RTCStats & { mimeType?: string; channels?: number; sdpFmtpLine?: string }>();
    const candidates = new Map<string, RTCStats & { candidateType?: string }>();
    let pairLocal: string | null = null;
    report.forEach((s: RTCStats & Record<string, unknown>) => {
      if (s.type === 'outbound-rtp' && s.kind === 'audio') {
        sent += Number(s.bytesSent ?? 0);
        codecId = (s.codecId as string | undefined) ?? codecId;
      } else if (s.type === 'inbound-rtp' && s.kind === 'audio') {
        received += Number(s.bytesReceived ?? 0);
        lost += Number(s.packetsLost ?? 0);
        packets += Number(s.packetsReceived ?? 0);
        jitter = s.jitter !== undefined ? Number(s.jitter) * 1000 : jitter;
        codecId = codecId ?? (s.codecId as string | undefined) ?? null;
      } else if (s.type === 'codec') {
        codecs.set(s.id, s);
      } else if (s.type === 'local-candidate') {
        candidates.set(s.id, s);
      } else if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') {
        rtt = s.currentRoundTripTime !== undefined ? Number(s.currentRoundTripTime) * 1000 : rtt;
        pairLocal = (s.localCandidateId as string | undefined) ?? null;
      }
    });
    if (pairLocal) route = candidates.get(pairLocal)?.candidateType ?? null;
    const now = performance.now();
    const prev = this.last;
    this.last = { at: now, sent, received, lost, packets };
    const seconds = prev ? (now - prev.at) / 1000 : 0;
    const codec = codecId ? codecs.get(codecId) : undefined;
    const newPackets = prev ? packets - prev.packets + (lost - prev.lost) : 0;
    return {
      sendBitrate: prev && seconds > 0 ? ((sent - prev.sent) * 8) / seconds : null,
      receiveBitrate: prev && seconds > 0 ? ((received - prev.received) * 8) / seconds : null,
      codec: codec?.mimeType ?? null,
      channels: codec?.channels ?? null,
      fmtp: codec?.sdpFmtpLine ?? null,
      roundTripMs: rtt,
      jitterMs: jitter,
      loss: prev && newPackets > 0 ? Math.max(0, lost - prev.lost) / newPackets : null,
      route,
    };
  }

  close(): void {
    this.closed = true;
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
