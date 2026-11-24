/**
 * Client-side image processing. Everything happens on-device with <canvas>;
 * the original File is only read, never modified or uploaded.
 */

export const THUMB_MAX_WIDTH = 300;
export const THUMB_MAX_HEIGHT = 600;
export const PREVIEW_MAX_DIMENSION = 1600;
const THUMB_TARGET_BYTES = 28 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i;

export function isProbablyImage(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

export function guessMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
    bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  };
  return map[ext] ?? 'image/jpeg';
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF orientation so portrait phone shots aren't sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* fall through to <img> decoding (older Safari, exotic formats) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw new Error(`Unsupported or corrupt image: ${(err as Error)?.message ?? 'decode failed'}`);
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height);
    // Safari < 16.4 has OffscreenCanvas without a 2D context.
    if (c.getContext('2d')) return c;
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))), type, quality);
  });
}

/** Encodes as WebP, falling back to JPEG where WebP encoding is unsupported (Safari returns PNG). */
async function encode(canvas: AnyCanvas, quality: number): Promise<Blob> {
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp.type === 'image/webp') return webp;
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

function fitWithin(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function render(decoded: DecodedImage, width: number, height: number): AnyCanvas {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return canvas;
}

export interface ThumbnailResult {
  blob: Blob;
  /** Original image dimensions (after EXIF orientation). */
  width: number;
  height: number;
}

/** Generates a ~15–25KB, 300px-wide WebP/JPEG thumbnail. */
export async function createThumbnail(file: File): Promise<ThumbnailResult> {
  const decoded = await decodeImage(file);
  try {
    const size = fitWithin(decoded.width, decoded.height, THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT);
    const canvas = render(decoded, size.width, size.height);
    let blob = await encode(canvas, 0.72);
    if (blob.size > THUMB_TARGET_BYTES) blob = await encode(canvas, 0.55);
    if (blob.size > THUMB_TARGET_BYTES * 1.5) blob = await encode(canvas, 0.4);
    return { blob, width: decoded.width, height: decoded.height };
  } finally {
    decoded.release();
  }
}

/** Medium-resolution preview used by the lightbox (generated on demand by the owner). */
export async function createPreview(file: File): Promise<Blob> {
  const decoded = await decodeImage(file);
  try {
    const fitsAlready = decoded.width <= PREVIEW_MAX_DIMENSION && decoded.height <= PREVIEW_MAX_DIMENSION;
    const webSafe = /^image\/(jpeg|png|webp|gif)$/.test(file.type);
    if (fitsAlready && webSafe && file.size < 1.5 * 1024 * 1024) return file;
    const size = fitWithin(decoded.width, decoded.height, PREVIEW_MAX_DIMENSION, PREVIEW_MAX_DIMENSION);
    return await encode(render(decoded, size.width, size.height), 0.82);
  } finally {
    decoded.release();
  }
}
