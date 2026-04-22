import type { ImageInput } from '../core/types';
import { resolveToBuffer } from './resolve-buffer';

/**
 * Image preprocessing utilities.
 * Handles loading images from various sources and optional preprocessing
 * (resize, contrast, deskew) before sending to vision models.
 */

/** Detect MIME type from magic bytes */
function detectMime(buf: Buffer): string {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf';
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }
  throw new Error('Unsupported image format: could not detect MIME type from magic bytes');
}

/** Normalize an image input to a base64 data URL string */
export async function imageToBase64(input: ImageInput): Promise<string> {
  if (typeof input === 'string' && input.startsWith('data:')) {
    return input;
  }
  const buf = await resolveToBuffer(input);
  const mime = detectMime(buf);
  const b64 = buf.toString('base64');
  return `data:${mime};base64,${b64}`;
}

/** Normalize an image input to one or more base64 data URL strings. */
export async function imageInputToBase64Urls(input: ImageInput): Promise<string[]> {
  if (Array.isArray(input)) {
    return Promise.all(input.map((item) => imageToBase64(item)));
  }
  return [await imageToBase64(input)];
}

/** Try to dynamically import sharp, returns null if unavailable */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryLoadSharp(): Promise<any> {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

const MAX_DIMENSION = 2048;

async function preprocessSingleBuffer(buf: Buffer): Promise<Buffer> {
  // Keep native PDFs unmodified so providers that support document inputs can consume them as-is.
  if (detectMime(buf) === 'application/pdf') return buf;

  const sharp = await tryLoadSharp();
  if (!sharp) return buf;

  let pipeline = sharp(buf);

  const metadata = await pipeline.metadata();
  const { width, height } = metadata;

  if (width && height && Math.max(width, height) > MAX_DIMENSION) {
    pipeline = width >= height
      ? pipeline.resize({ width: MAX_DIMENSION, withoutEnlargement: true })
      : pipeline.resize({ height: MAX_DIMENSION, withoutEnlargement: true });
  }

  return pipeline.normalize().png().toBuffer();
}

/** Optional preprocessing: resize, enhance contrast. Returns processed buffer(s) while preserving multi-page inputs. */
export async function preprocessImage(input: ImageInput): Promise<ImageInput> {
  if (Array.isArray(input)) {
    const buffers = await Promise.all(input.map((item) => resolveToBuffer(item)));
    return Promise.all(buffers.map((buffer) => preprocessSingleBuffer(buffer)));
  }

  const buf = await resolveToBuffer(input);
  return preprocessSingleBuffer(buf);
}
