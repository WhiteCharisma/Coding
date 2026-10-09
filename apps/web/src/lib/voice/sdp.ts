/**
 * Opus settings written into the SDP (RFC 7587). Browsers read them from the *remote* description:
 * what we put in our offer/answer tells the other side how to encode the audio it sends us.
 */
export interface OpusParams {
  /** Ask for stereo (stereo=1) and declare that we send stereo (sprop-stereo=1). */
  stereo: boolean;
  /** Highest average bitrate the other side should use when sending to us (bits/s). */
  maxAverageBitrate: number;
  /** Constant bitrate: predictable quality for music (and measurable). */
  cbr: boolean;
  /** Forward error correction inside the stream (helps on lossy links). */
  useInbandFec: boolean;
  /** Discontinuous transmission (silence suppression). Off: it clips quiet passages of music. */
  useDtx: boolean;
}

/** Payload types used by Opus in an SDP ("a=rtpmap:<pt> opus/48000/2"). */
export function opusPayloadTypes(sdp: string): string[] {
  const out: string[] = [];
  for (const m of sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000(?:\/\d+)?\s*$/gim)) out.push(m[1]!);
  return out;
}

/** Rewrites (or adds) the fmtp line of every Opus payload type; other lines are kept as they are. */
export function tuneOpus(sdp: string, p: OpusParams): string {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(eol);
  for (const pt of opusPayloadTypes(sdp)) {
    const wanted: Record<string, string> = {
      stereo: p.stereo ? '1' : '0',
      'sprop-stereo': p.stereo ? '1' : '0',
      maxaveragebitrate: String(Math.round(p.maxAverageBitrate)),
      maxplaybackrate: '48000',
      cbr: p.cbr ? '1' : '0',
      useinbandfec: p.useInbandFec ? '1' : '0',
      usedtx: p.useDtx ? '1' : '0',
    };
    const fmtpAt = lines.findIndex((l) => l.startsWith(`a=fmtp:${pt} `));
    if (fmtpAt >= 0) {
      const params = new Map<string, string>();
      for (const part of lines[fmtpAt]!.slice(`a=fmtp:${pt} `.length).split(';')) {
        const [k, v] = part.split('=');
        if (k?.trim()) params.set(k.trim(), (v ?? '').trim());
      }
      for (const [k, v] of Object.entries(wanted)) params.set(k, v);
      lines[fmtpAt] = `a=fmtp:${pt} ${[...params].map(([k, v]) => `${k}=${v}`).join(';')}`;
    } else {
      const rtpmapAt = lines.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `));
      lines.splice(
        rtpmapAt + 1,
        0,
        `a=fmtp:${pt} ${Object.entries(wanted)
          .map(([k, v]) => `${k}=${v}`)
          .join(';')}`,
      );
    }
  }
  return lines.join(eol);
}

/** Reads the Opus fmtp parameters of an SDP (for diagnostics and tests). */
export function readOpusFmtp(sdp: string): Record<string, string> {
  const pt = opusPayloadTypes(sdp)[0];
  const line = pt ? sdp.split(/\r?\n/).find((l) => l.startsWith(`a=fmtp:${pt} `)) : undefined;
  const out: Record<string, string> = {};
  for (const part of line?.slice(`a=fmtp:${pt} `.length).split(';') ?? []) {
    const [k, v] = part.split('=');
    if (k) out[k.trim()] = (v ?? '').trim();
  }
  return out;
}
