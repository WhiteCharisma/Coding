/**
 * Removes location and descriptive metadata from uploaded photos WITHOUT re-encoding them
 * (originals keep their exact pixels and quality):
 *
 * - JPEG: XMP and IPTC segments are dropped; inside EXIF the GPS directory is erased (its
 *   values zeroed, the directory emptied). Orientation and the rest of EXIF stay valid, so
 *   phone photos still display the right way up.
 * - PNG: the GPS directory inside eXIf is erased (chunk CRC recomputed); iTXt/tEXt/zTXt
 *   text chunks (which carry XMP and free-form metadata) are dropped.
 * - WebP: the GPS directory inside EXIF is erased; the XMP chunk is dropped.
 *
 * Only the metadata blocks are read into memory; image data is copied in 1 MB blocks.
 */
import { open, rename, rm, type FileHandle } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

const BLOCK = 1024 * 1024;
const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};
const GPS_IFD_POINTER = 0x8825;

/**
 * Erases the GPS directory of a TIFF/EXIF block in place (same length). Returns true when a
 * GPS directory with entries was found and erased. Malformed blocks are left untouched.
 */
export function eraseGpsInTiff(tiff: Buffer): boolean {
  if (tiff.length < 8) return false;
  const order = tiff.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const le = order === 'II';
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const inside = (o: number, len: number) => o >= 0 && len >= 0 && o + len <= tiff.length;
  if (u16(2) !== 42) return false;
  const ifd0 = u32(4);
  if (!inside(ifd0, 2)) return false;
  const count0 = u16(ifd0);
  let gpsOffset = -1;
  for (let i = 0; i < count0; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (!inside(entry, 12)) return false;
    if (u16(entry) === GPS_IFD_POINTER) gpsOffset = u32(entry + 8);
  }
  if (gpsOffset < 0 || !inside(gpsOffset, 2)) return false;
  const gpsCount = u16(gpsOffset);
  if (gpsCount === 0 || !inside(gpsOffset + 2, gpsCount * 12)) return false;
  for (let i = 0; i < gpsCount; i++) {
    const entry = gpsOffset + 2 + i * 12;
    const size = (TYPE_SIZES[u16(entry + 2)] ?? 1) * u32(entry + 4);
    if (size > 4) {
      const valueAt = u32(entry + 8);
      if (inside(valueAt, size)) tiff.fill(0, valueAt, valueAt + size);
    }
  }
  tiff.fill(0, gpsOffset + 2, gpsOffset + 2 + gpsCount * 12);
  if (le) tiff.writeUInt16LE(0, gpsOffset);
  else tiff.writeUInt16BE(0, gpsOffset);
  return true;
}

const EXIF_PREFIX = Buffer.from('Exif\0\0', 'latin1');
const eraseGpsInExifPayload = (payload: Buffer) =>
  eraseGpsInTiff(payload.subarray(0, 6).equals(EXIF_PREFIX) ? payload.subarray(6) : payload);

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** Copies [start, end) of `src` to the end of `dest` in blocks. */
async function copyRange(src: FileHandle, dest: FileHandle, start: number, end: number): Promise<void> {
  const buf = Buffer.alloc(Math.min(BLOCK, Math.max(1, end - start)));
  for (let pos = start; pos < end;) {
    const { bytesRead } = await src.read(buf, 0, Math.min(buf.length, end - pos), pos);
    if (bytesRead === 0) break;
    await dest.write(buf.subarray(0, bytesRead));
    pos += bytesRead;
  }
}

type Piece = Buffer | { from: number; to: number };

/** Writes the pieces (new buffers and ranges of the original) to a new file, then replaces the original. */
async function rewrite(file: string, src: FileHandle, pieces: Piece[]): Promise<void> {
  const tmp = `${file}.meta`;
  const dest = await open(tmp, 'w', 0o600);
  try {
    for (const p of pieces) {
      if (Buffer.isBuffer(p)) await dest.write(p);
      else await copyRange(src, dest, p.from, p.to);
    }
  } catch (err) {
    await dest.close();
    await rm(tmp, { force: true });
    throw err;
  }
  await dest.close();
  await rename(tmp, file);
}

const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0';
const XMP_EXT_ID = 'http://ns.adobe.com/xmp/extension/\0';
const IPTC_ID = 'Photoshop 3.0\0';

async function stripJpeg(file: string, handle: FileHandle, size: number): Promise<boolean> {
  if (!(await readAt(handle, 0, 2)).equals(Buffer.from([0xff, 0xd8]))) return false;
  const pieces: Piece[] = [Buffer.from([0xff, 0xd8])];
  let pos = 2;
  let changed = false;
  // Metadata lives in the segments before the image data (start of scan, 0xFFDA).
  while (pos + 4 <= size) {
    const head = await readAt(handle, pos, 4);
    if (head[0] !== 0xff) return false;
    const marker = head[1]!;
    if (marker === 0xff) {
      pos += 1; // fill byte before a marker
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = head.readUInt16BE(2);
    if (length < 2 || pos + 2 + length > size) return false;
    const isApp1 = marker === 0xe1;
    const isApp13 = marker === 0xed;
    if (isApp1 || isApp13) {
      const segment = await readAt(handle, pos, 2 + length);
      const body = segment.subarray(4);
      const id = body.toString('latin1', 0, 36);
      if ((isApp1 && (id.startsWith(XMP_ID) || id.startsWith(XMP_EXT_ID))) || (isApp13 && id.startsWith(IPTC_ID))) {
        changed = true; // dropped
      } else {
        if (isApp1 && body.subarray(0, 6).equals(EXIF_PREFIX) && eraseGpsInTiff(body.subarray(6))) changed = true;
        pieces.push(segment);
      }
    } else {
      pieces.push({ from: pos, to: pos + 2 + length });
    }
    pos += 2 + length;
  }
  if (!changed) return false;
  pieces.push({ from: pos, to: size });
  await rewrite(file, handle, pieces);
  return true;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_TEXT_CHUNKS = new Set(['iTXt', 'tEXt', 'zTXt']);

async function stripPng(file: string, handle: FileHandle, size: number): Promise<boolean> {
  if (!(await readAt(handle, 0, 8)).equals(PNG_SIGNATURE)) return false;
  const pieces: Piece[] = [PNG_SIGNATURE];
  let pos = 8;
  let changed = false;
  while (pos + 12 <= size) {
    const head = await readAt(handle, pos, 8);
    const length = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    const end = pos + 12 + length;
    if (end > size) return false;
    if (PNG_TEXT_CHUNKS.has(type)) {
      changed = true;
    } else if (type === 'eXIf') {
      const chunk = await readAt(handle, pos, 12 + length);
      if (eraseGpsInTiff(chunk.subarray(8, 8 + length))) {
        chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + length)) >>> 0, 8 + length);
        changed = true;
      }
      pieces.push(chunk);
    } else {
      pieces.push({ from: pos, to: end });
    }
    pos = end;
    if (type === 'IEND') break;
  }
  if (!changed) return false;
  await rewrite(file, handle, pieces);
  return true;
}

async function stripWebp(file: string, handle: FileHandle, size: number): Promise<boolean> {
  const header = await readAt(handle, 0, 12);
  if (header.toString('latin1', 0, 4) !== 'RIFF' || header.toString('latin1', 8, 12) !== 'WEBP') return false;
  const chunks: { type: string; pos: number; end: number; data?: Buffer }[] = [];
  let pos = 12;
  let changed = false;
  while (pos + 8 <= size) {
    const head = await readAt(handle, pos, 8);
    const type = head.toString('latin1', 0, 4);
    const length = head.readUInt32LE(4);
    const end = pos + 8 + length + (length % 2);
    if (pos + 8 + length > size) return false;
    if (type === 'XMP ') {
      changed = true;
    } else if (type === 'EXIF' || type === 'VP8X') {
      const data = await readAt(handle, pos, Math.min(end, size) - pos);
      if (type === 'EXIF' && eraseGpsInExifPayload(data.subarray(8, 8 + length))) changed = true;
      chunks.push({ type, pos, end, data });
    } else {
      chunks.push({ type, pos, end });
    }
    pos = end;
  }
  if (!changed) return false;
  const vp8x = chunks.find((c) => c.type === 'VP8X');
  if (vp8x?.data) vp8x.data[8] = vp8x.data[8]! & ~0x04; // clear the "has XMP" flag
  const bodySize = chunks.reduce((sum, c) => sum + (c.end - c.pos), 0);
  const riff = Buffer.from(header);
  riff.writeUInt32LE(4 + bodySize, 4);
  await rewrite(file, handle, [riff, ...chunks.map((c) => c.data ?? { from: c.pos, to: c.end })]);
  return true;
}

/** Strips location/descriptive metadata from a JPEG, PNG or WebP file in place. Returns true if it changed. */
export async function stripLocationMetadata(file: string, mime: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (mime === 'image/jpeg') return await stripJpeg(file, handle, size);
    if (mime === 'image/png') return await stripPng(file, handle, size);
    if (mime === 'image/webp') return await stripWebp(file, handle, size);
    return false;
  } finally {
    await handle.close();
  }
}
