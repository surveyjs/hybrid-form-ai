import type { ImageInput } from '../core/types';
import { resolveToBuffer } from './resolve-buffer';
import jsQR from 'jsqr';

/**
 * QR code and unique ID detection from form images.
 */

/** Result of unique ID detection */
export interface UniqueIdResult {
  id: string | null;
  source: 'qr' | 'barcode' | 'text' | null;
  confidence: number;
}

/** Try to get RGBA pixel data from an image buffer using sharp */
async function toRGBA(buf: Buffer): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default ?? sharpModule;
    const image = sharp(buf).ensureAlpha().raw();
    const { data, info } = await image.toBuffer({ resolveWithObject: true });
    return {
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const NUMERIC_ID_PATTERN = /\b(?:ID|REF|#)\s*:?\s*(\d{4,})\b/i;

/**
 * Detect a unique ID from a scanned form image.
 * Tries QR code detection first, then falls back to regex text patterns.
 */
export async function detectUniqueId(image: ImageInput): Promise<UniqueIdResult> {
  if (Array.isArray(image)) {
    for (const page of image) {
      const result = await detectUniqueId(page);
      if (result.id) {
        return result;
      }
    }
    return { id: null, source: null, confidence: 0 };
  }

  const buf = await resolveToBuffer(image);
  const rgba = await toRGBA(buf);

  if (rgba) {
    const result = jsQR(rgba.data, rgba.width, rgba.height);
    if (result && result.data) {
      return { id: result.data, source: 'qr', confidence: 1.0 };
    }
  }

  // Fallback: try regex patterns on decoded text (from QR data or raw buffer string)
  const textContent = buf.toString('utf-8');

  const uuidMatch = textContent.match(UUID_PATTERN);
  if (uuidMatch) {
    return { id: uuidMatch[0], source: 'text', confidence: 0.7 };
  }

  const numericMatch = textContent.match(NUMERIC_ID_PATTERN);
  if (numericMatch) {
    return { id: numericMatch[1], source: 'text', confidence: 0.5 };
  }

  return { id: null, source: null, confidence: 0 };
}
