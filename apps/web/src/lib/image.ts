/**
 * Crops an image to a centred square and downscales it in the browser before
 * upload (profile pictures and community icons). Keeps uploads small and avoids
 * any server-side image processing.
 */
export async function squareImage(file: File, size = 384): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const side = Math.min(bitmap.width, bitmap.height);
  const target = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, target, target);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

/** Server limits for images (apps/server/src/uploads/service.ts). */
const MAX_SIDE = 8192;
const MAX_PIXELS = 40_000_000;

export interface PreparedImage {
  file: File;
  width: number | null;
  height: number | null;
}

/**
 * Reads an image's size for an instant local preview. The file is sent as it is: originals keep
 * their full quality (the server makes small previews for the chat). Only an image beyond the
 * server's limits is downscaled — otherwise the server would refuse it.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { file, width: null, height: null };
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  if (scale >= 1 || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
    bitmap.close();
    return { file, width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) return { file, width, height };
  return { file: new File([blob], file.name, { type }), width: canvas.width, height: canvas.height };
}
