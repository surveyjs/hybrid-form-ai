import { readFile } from 'node:fs/promises';
import type { ImageInput } from '../core/types';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FETCH_BYTES = 10 * 1024 * 1024; // 10 MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryLoadSharp(): Promise<any> {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export async function composeImageBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const sharp = await tryLoadSharp();
  if (!sharp) {
    throw new Error('Multiple image inputs require the optional "sharp" dependency to be installed');
  }

  const metadataList = await Promise.all(buffers.map((buffer) => sharp(buffer).metadata()));
  const width = Math.max(...metadataList.map((metadata) => metadata.width ?? 0));
  const height = metadataList.reduce((sum, metadata) => sum + (metadata.height ?? 0), 0);

  if (width <= 0 || height <= 0) {
    throw new Error('Failed to compose multiple images: could not determine image dimensions');
  }

  let top = 0;
  const composite = buffers.map((buffer, index) => {
    const input = {
      input: buffer,
      left: 0,
      top,
    };
    top += metadataList[index].height ?? 0;
    return input;
  });

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composite)
    .png()
    .toBuffer();
}

/** Resolve an ImageInput to a raw Buffer */
export async function resolveToBuffer(input: ImageInput): Promise<Buffer> {
  if (Array.isArray(input)) {
    if (input.length === 0) {
      throw new Error('Unsupported image input type');
    }
    const buffers = await Promise.all(input.map((item) => resolveToBuffer(item)));
    return composeImageBuffers(buffers);
  }
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(input, { signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > MAX_FETCH_BYTES) {
          throw new Error(`Failed to fetch image: response too large (${buf.byteLength} bytes, max ${MAX_FETCH_BYTES})`);
        }
        return buf;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Failed to fetch image: request timed out after ${FETCH_TIMEOUT_MS}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    return readFile(input);
  }
  throw new Error('Unsupported image input type');
}
