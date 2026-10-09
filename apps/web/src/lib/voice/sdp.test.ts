import { describe, expect, it } from 'vitest';
import { opusPayloadTypes, readOpusFmtp, tuneOpus, type OpusParams } from './sdp';

// Trimmed from a real Chromium offer.
const offer = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126',
  'c=IN IP4 0.0.0.0',
  'a=mid:0',
  'a=sendrecv',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  'a=fmtp:63 111/111',
  'a=rtpmap:9 G722/8000',
  '',
].join('\r\n');

const studio: OpusParams = { stereo: true, maxAverageBitrate: 320000, cbr: true, useInbandFec: true, useDtx: false };
const voice: OpusParams = { stereo: false, maxAverageBitrate: 64000, cbr: false, useInbandFec: true, useDtx: false };

describe('Opus SDP tuning', () => {
  it('finds the Opus payload type', () => {
    expect(opusPayloadTypes(offer)).toEqual(['111']);
  });

  it('asks for 320 kbit/s stereo CBR without losing the existing parameters', () => {
    const tuned = tuneOpus(offer, studio);
    expect(readOpusFmtp(tuned)).toEqual({
      minptime: '10',
      useinbandfec: '1',
      stereo: '1',
      'sprop-stereo': '1',
      maxaveragebitrate: '320000',
      maxplaybackrate: '48000',
      cbr: '1',
      usedtx: '0',
    });
    // Nothing else changes: same lines, same order, CRLF kept, RED untouched.
    const before = offer.split('\r\n');
    const after = tuned.split('\r\n');
    expect(after).toHaveLength(before.length);
    expect(after.filter((l, i) => l !== before[i])).toEqual([expect.stringMatching(/^a=fmtp:111 /)]);
    expect(tuned).toContain('a=fmtp:63 111/111');
  });

  it('switches back to mono voice settings', () => {
    expect(readOpusFmtp(tuneOpus(tuneOpus(offer, studio), voice))).toMatchObject({
      stereo: '0',
      'sprop-stereo': '0',
      maxaveragebitrate: '64000',
      cbr: '0',
    });
  });

  it('adds an fmtp line when the SDP has none', () => {
    const bare = offer.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n', '');
    const tuned = tuneOpus(bare, studio);
    const lines = tuned.split('\r\n');
    expect(lines[lines.indexOf('a=rtpmap:111 opus/48000/2') + 1]).toMatch(/^a=fmtp:111 stereo=1;/);
  });
});
