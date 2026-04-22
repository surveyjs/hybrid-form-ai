import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveToBuffer } from '../resolve-buffer';

describe('resolveToBuffer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns Buffer input unchanged', async () => {
    const buf = Buffer.from('hello');
    const result = await resolveToBuffer(buf);
    expect(result).toBe(buf);
  });

  it('converts Uint8Array to Buffer', async () => {
    const uint8 = new Uint8Array([1, 2, 3]);
    const result = await resolveToBuffer(uint8);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
  });

  it('fetches from HTTP URL', async () => {
    const mockData = Buffer.from('image-bytes');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockData.buffer.slice(mockData.byteOffset, mockData.byteOffset + mockData.byteLength),
    } as Response);

    const result = await resolveToBuffer('https://example.com/image.png');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('image-bytes');
  });

  it('throws on non-OK HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    await expect(resolveToBuffer('https://example.com/missing.png'))
      .rejects.toThrow('Failed to fetch image: 404 Not Found');
  });

  it('throws on fetch timeout (AbortError)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    await expect(resolveToBuffer('https://example.com/slow.png'))
      .rejects.toThrow('Failed to fetch image: request timed out');
  });

  it('throws when response is too large', async () => {
    const large = Buffer.alloc(11 * 1024 * 1024); // 11 MB
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => large.buffer.slice(large.byteOffset, large.byteOffset + large.byteLength),
    } as Response);

    await expect(resolveToBuffer('http://example.com/huge.png'))
      .rejects.toThrow('response too large');
  });

  it('reads from file path', async () => {
    vi.resetModules();
    const mockReadFile = vi.fn().mockResolvedValue(Buffer.from('file-data'));
    vi.doMock('node:fs/promises', () => ({
      readFile: mockReadFile,
    }));

    const { resolveToBuffer: resolveToBufferFresh } = await import('../resolve-buffer');
    const result = await resolveToBufferFresh('/tmp/test.png');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('file-data');
    expect(mockReadFile).toHaveBeenCalledWith('/tmp/test.png');

    vi.doUnmock('node:fs/promises');
  });

  it('throws on unsupported input type', async () => {
    await expect(resolveToBuffer(42 as unknown as string))
      .rejects.toThrow('Unsupported image input type');
  });

  it('re-throws non-AbortError errors from fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

    await expect(resolveToBuffer('https://example.com/img.png'))
      .rejects.toThrow('Network failure');
  });

  it('decodes a base64 data URL to Buffer', async () => {
    const original = Buffer.from('hello pdf');
    const dataUrl = `data:application/pdf;base64,${original.toString('base64')}`;
    const result = await resolveToBuffer(dataUrl);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.equals(original)).toBe(true);
  });

  it('rejects an oversized base64 data URL', async () => {
    // Produce a base64 string whose estimated decoded size exceeds 10MB.
    // base64 length needed: 10MB * 4/3 ≈ 13,981,014 chars — use 14MB of chars.
    const oversizedB64 = 'A'.repeat(14 * 1024 * 1024);
    const dataUrl = `data:application/pdf;base64,${oversizedB64}`;
    await expect(resolveToBuffer(dataUrl))
      .rejects.toThrow('exceeds the maximum allowed size');
  });

  it('rejects an oversized plain-text data URL', async () => {
    const oversizedPayload = 'x'.repeat(11 * 1024 * 1024);
    const dataUrl = `data:text/plain,${oversizedPayload}`;
    await expect(resolveToBuffer(dataUrl))
      .rejects.toThrow('exceeds the maximum allowed size');
  });
});
