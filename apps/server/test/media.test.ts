import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { synthesize } from '../src/seed/audio';
import { createTestServer, nonce, type TestClient, type TestServer } from './helpers';

let srv: TestServer;
let alice: TestClient;
let bob: TestClient;
let outsider: TestClient;
let general: any;

function form(file: Buffer, name: string): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(file)]), name);
  return fd;
}
const upload = (c: TestClient, fd: FormData, headers: Record<string, string> = {}) =>
  c.req('POST', `/api/channels/${general.id}/attachments`, undefined, { raw: fd, headers });
const attach = (c: TestClient, ids: string[]) =>
  c.post(`/api/channels/${general.id}/messages`, { content: '', nonce: nonce(), attachmentIds: ids });
const download = async (c: TestClient, url: string) => {
  const res = await fetch(`${srv.url}${url}`, { headers: { cookie: c.cookie } });
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
};

/** Photo-like JPEG (noise compresses like a real photo) with orientation 6 and a GPS position. */
const photoWithLocation = () =>
  sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '48/1 51/1 2400/100',
        GPSLongitudeRef: 'E',
        GPSLongitude: '2/1 21/1 300/100',
      },
    })
    .withXmp(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="48,51.4N"/></rdf:RDF></x:xmpmeta>',
    )
    .toBuffer();

/** Inserts an IPTC (Photoshop APP13) segment naming a city right after the JPEG's SOI marker. */
function withIptc(jpeg: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), Buffer.from('8BIM City: Lyon', 'latin1')]);
  const head = Buffer.from([0xff, 0xed, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)]);
}

/** Number of entries in the GPS directory of an EXIF block (as returned by sharp's metadata). */
function gpsEntries(exif: Buffer | undefined): number {
  if (!exif) return 0;
  const tiff = exif.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? exif.subarray(6) : exif;
  const le = tiff.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd0 = u32(4);
  for (let i = 0; i < u16(ifd0); i++) {
    const entry = ifd0 + 2 + i * 12;
    if (u16(entry) === 0x8825) return u16(u32(entry + 8));
  }
  return 0;
}

/** Image data (from the start-of-scan marker on) — must be byte-identical if nothing was re-encoded. */
const scanData = (jpeg: Buffer) => jpeg.subarray(jpeg.indexOf(Buffer.from([0xff, 0xda])));

beforeAll(async () => {
  srv = await createTestServer();
  [alice, bob, outsider] = [srv.client(), srv.client(), srv.client()];
  await alice.register('alice');
  await bob.register('bob');
  await outsider.register('outsider');
  const community = (await alice.post('/api/communities', { name: 'Media Lab' })).body.community;
  general = community.channels.find((c: any) => c.name === 'general');
  const inv = (await alice.post(`/api/communities/${community.id}/invites`, {})).body.invite;
  await bob.post(`/api/invites/${inv.code}/accept`);
});
afterAll(async () => {
  await srv.stop();
});

describe('image previews', () => {
  it('serves a small WebP preview of a large image, with the same access rules as the original', async () => {
    const photo = await photoWithLocation();
    const att = (await upload(alice, form(photo, 'paris.jpg'))).body.attachment;
    expect(att.previewUrl).toBe(`${att.url}/preview`);
    expect((await download(bob, att.previewUrl)).status).toBe(404); // not attached yet: uploader only

    await attach(alice, [att.id]);
    const preview = await download(bob, att.previewUrl);
    expect(preview.status).toBe(200);
    expect(preview.type).toBe('image/webp');
    const meta = await sharp(preview.body).metadata();
    // Orientation 6 is applied: the 1600×1200 photo becomes portrait, at most 960px.
    expect([meta.width, meta.height]).toEqual([720, 960]);
    expect(meta.exif).toBeUndefined(); // previews carry no metadata
    expect(preview.body.length).toBeLessThan(photo.length / 4);
    expect((await download(outsider, att.previewUrl)).status).toBe(404);
  });

  it('shows small images as they are (no preview)', async () => {
    const small = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7ab' } })
      .png()
      .toBuffer();
    const att = (await upload(alice, form(small, 'icon.png'))).body.attachment;
    expect(att.previewUrl).toBeNull();
    expect((await download(alice, `${att.url}/preview`)).status).toBe(404);
  });
});

describe('photo metadata', () => {
  it('removes GPS, XMP and IPTC from photos without re-encoding them; orientation stays', async () => {
    const original = withIptc(await photoWithLocation());
    expect(gpsEntries((await sharp(original).metadata()).exif)).toBeGreaterThan(0);
    const att = (await upload(alice, form(original, 'holiday.jpg'))).body.attachment;
    await attach(alice, [att.id]);
    const stored = (await download(bob, att.url)).body;
    const meta = await sharp(stored).metadata();
    expect(gpsEntries(meta.exif)).toBe(0);
    expect(meta.orientation).toBe(6);
    expect(meta.xmp).toBeUndefined();
    expect(stored.includes(Buffer.from('Lyon'))).toBe(false);
    expect(stored.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(scanData(stored).equals(scanData(original))).toBe(true); // pixels untouched
    expect(att.size).toBe(stored.length);
  });

  it('removes GPS from PNG and WebP images as well', async () => {
    for (const format of ['png', 'webp'] as const) {
      const base = sharp({
        create: {
          width: 1200,
          height: 900,
          channels: 3,
          background: '#5a5a5a',
          noise: { type: 'gaussian', mean: 90, sigma: 40 },
        },
      });
      const image = await (format === 'png' ? base.png() : base.webp())
        .withMetadata({ orientation: 3 })
        .withExifMerge({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 51/1 0/1' } })
        .toBuffer();
      expect(gpsEntries((await sharp(image).metadata()).exif)).toBeGreaterThan(0);
      const att = (await upload(alice, form(image, `map.${format}`))).body.attachment;
      const stored = (await download(alice, att.url)).body;
      const meta = await sharp(stored).metadata();
      expect(gpsEntries(meta.exif), format).toBe(0);
      expect(meta.orientation, format).toBe(3);
      expect(meta.width, format).toBe(1200);
    }
  });
});

describe('upload reliability', () => {
  it('a retried upload with the same key returns the file stored the first time', async () => {
    const photo = await photoWithLocation();
    const first = await upload(alice, form(photo, 'a.jpg'), { 'x-upload-key': 'retry-key-0001' });
    const retry = await upload(alice, form(photo, 'a.jpg'), { 'x-upload-key': 'retry-key-0001' });
    expect(retry.status).toBe(201);
    expect(retry.headers.get('x-upload-replayed')).toBe('1');
    expect(retry.body.attachment.id).toBe(first.body.attachment.id);
    // Keys are per person: someone else's identical key never returns this file.
    const other = await upload(bob, form(photo, 'a.jpg'), { 'x-upload-key': 'retry-key-0001' });
    expect(other.body.attachment.id).not.toBe(first.body.attachment.id);
    expect((await upload(alice, form(photo, 'a.jpg'), { 'x-upload-key': 'bad key!' })).status).toBe(400);
  });

  it('reports where the server spent its time', async () => {
    const res = await upload(alice, form(await photoWithLocation(), 't.jpg'));
    expect(res.headers.get('server-timing')).toMatch(/^receive;dur=[\d.]+, inspect;dur=[\d.]+, store;dur=[\d.]+$/);
  });

  it('lets the uploader add the waveform after the upload started', async () => {
    const wav = synthesize({ bpm: 120, style: 'musicbox', seed: 'w', chords: [[60, 64, 67]] }, 8).wav;
    const att = (await upload(alice, form(wav, 'loop.wav'))).body.attachment;
    expect(att.waveform).toBeNull();
    const meta = { waveform: [10, 50, 90, 40], durationMs: 2500 };
    expect((await bob.put(`/api/attachments/${att.id}/audio`, meta)).status).toBe(404);
    const res = await alice.put(`/api/attachments/${att.id}/audio`, meta);
    expect(res.status).toBe(200);
    expect(res.body.attachment).toMatchObject(meta);
    expect((await alice.put(`/api/attachments/${att.id}/audio`, { waveform: [101], durationMs: 1 })).status).toBe(400);
    const sent = (await attach(alice, [att.id])).body.message;
    expect(sent.attachments[0]).toMatchObject(meta);
    // Once attached to a message it can no longer change.
    expect((await alice.put(`/api/attachments/${att.id}/audio`, meta)).status).toBe(404);
    const image = (await upload(alice, form(await photoWithLocation(), 'x.jpg'))).body.attachment;
    expect((await alice.put(`/api/attachments/${image.id}/audio`, meta)).status).toBe(404);
  });
});
