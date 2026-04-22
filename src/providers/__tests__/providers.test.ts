import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openai } from '../openai';
import { anthropic } from '../anthropic';
import { ollama } from '../ollama';

// ── OpenAI mock ────────────────────────────────────────────────────────
const mockOpenAICreate = vi.fn();
const mockOpenAIResponsesCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockOpenAICreate } };
    responses = { create: mockOpenAIResponsesCreate };
  },
}));

// ── Anthropic mock ─────────────────────────────────────────────────────
const mockAnthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────
// Minimal valid 1×1 PNG — providers need real magic bytes for MIME detection
const fakeImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
const fakePrompt = 'Extract form data';
const fakeSystemPrompt = 'You are a form extractor.';

describe('Provider factories', () => {
  it('openai returns a provider with correct name and model', () => {
    const provider = openai('gpt-4o');
    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('gpt-4o');
    expect(typeof provider.extractFromImage).toBe('function');
  });

  it('anthropic returns a provider with correct name and model', () => {
    const provider = anthropic('claude-sonnet-4-6');
    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe('claude-sonnet-4-6');
  });

  it('ollama returns a provider with correct name and model', () => {
    const provider = ollama('llama-3.2-vision');
    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('llama-3.2-vision');
  });
});

// ── OpenAI Provider ────────────────────────────────────────────────────
describe('OpenAI provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
    mockOpenAICreate.mockReset();
    mockOpenAIResponsesCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends correct request shape and returns normalized response', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{"name":"John"}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    });

    const provider = openai('gpt-4o');
    const result = await provider.extractFromImage({
      image: fakeImage,
      prompt: fakePrompt,
      systemPrompt: fakeSystemPrompt,
    });

    expect(result.content).toBe('{"name":"John"}');
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 });

    // Verify request shape
    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.model).toBe('gpt-4o');
    expect(call.response_format).toEqual({ type: 'json_object' });
    expect(call.messages).toHaveLength(2);
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[1].role).toBe('user');
    expect(call.messages[1].content).toHaveLength(2);
    expect(call.messages[1].content[0].type).toBe('text');
    expect(call.messages[1].content[1].type).toBe('image_url');
  });

  it('omits system message when systemPrompt is not provided', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const provider = openai('gpt-4o');
    await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe('user');
  });

  it('throws when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = openai('gpt-4o');
    await expect(
      provider.extractFromImage({ image: fakeImage, prompt: fakePrompt }),
    ).rejects.toThrow('OPENAI_API_KEY environment variable is not set');
  });

  it('wraps API errors with descriptive message', async () => {
    mockOpenAICreate.mockRejectedValue(new Error('Rate limit exceeded'));
    const provider = openai('gpt-4o');
    await expect(
      provider.extractFromImage({ image: fakeImage, prompt: fakePrompt }),
    ).rejects.toThrow('OpenAI API error: Rate limit exceeded');
  });

  it('handles missing usage in response', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
    });

    const provider = openai('gpt-4o');
    const result = await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });
    expect(result.content).toBe('{}');
    expect(result.usage).toBeUndefined();
  });

  it('accepts extractor-generated PNG data URLs unchanged', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const provider = openai('gpt-4o');
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    await provider.extractFromImage({ image: dataUrl, prompt: fakePrompt });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content[1].image_url.url).toBe(dataUrl);
  });

  it('sends one image block per page for multi-page inputs', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const provider = openai('gpt-4o');
    const dataUrls = [
      'data:image/png;base64,AAA=',
      'data:image/png;base64,BBB=',
      'data:image/png;base64,CCC=',
    ];

    await provider.extractFromImage({ image: dataUrls, prompt: fakePrompt });

    const call = mockOpenAICreate.mock.calls[0][0];
    expect(call.messages[0].content).toHaveLength(4);
    expect(call.messages[0].content[1].image_url.url).toBe(dataUrls[0]);
    expect(call.messages[0].content[2].image_url.url).toBe(dataUrls[1]);
    expect(call.messages[0].content[3].image_url.url).toBe(dataUrls[2]);
  });

  it('sends native PDF via responses API input_file blocks', async () => {
    mockOpenAIResponsesCreate.mockResolvedValue({
      output_text: '{"name":"Doc User"}',
      usage: { input_tokens: 120, output_tokens: 35, total_tokens: 155 },
    });

    const provider = openai('gpt-4o');
    const result = await provider.extractFromImage({
      image: fakePdf,
      prompt: fakePrompt,
      systemPrompt: fakeSystemPrompt,
    });

    expect(result.content).toBe('{"name":"Doc User"}');
    expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 35, totalTokens: 155 });
    expect(mockOpenAICreate).not.toHaveBeenCalled();

    const call = mockOpenAIResponsesCreate.mock.calls[0][0];
    expect(call.model).toBe('gpt-4o');
    expect(call.instructions).toBe(fakeSystemPrompt);
    expect(call.input[0].content[0].type).toBe('input_text');
    expect(call.input[0].content[1].type).toBe('input_file');
    expect(call.input[0].content[1].file_data).toMatch(/^data:application\/pdf;base64,/);
  });
});

// ── Anthropic Provider ─────────────────────────────────────────────────
describe('Anthropic provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    mockAnthropicCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends correct request shape and returns normalized response', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"name":"Jane"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 200, output_tokens: 30 },
    });

    const provider = anthropic('claude-sonnet-4-6');
    const result = await provider.extractFromImage({
      image: fakeImage,
      prompt: fakePrompt,
      systemPrompt: fakeSystemPrompt,
    });

    expect(result.content).toBe('{"name":"Jane"}');
    expect(result.truncated).toBe(false);
    expect(result.usage).toEqual({ promptTokens: 200, completionTokens: 30, totalTokens: 230 });

    // Verify request shape
    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-4-6');
    expect(call.max_tokens).toBe(16384);
    expect(call.system).toBe(fakeSystemPrompt);
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content[0].type).toBe('image');
    expect(call.messages[0].content[0].source.type).toBe('base64');
    expect(call.messages[0].content[1].type).toBe('text');
    // Verify JSON-only instruction appended to prompt
    expect(call.messages[0].content[1].text).toContain('Return ONLY the raw JSON object');
  });

  it('respects maxTokens option', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = anthropic('claude-sonnet-4-6', { maxTokens: 8192 });
    await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.max_tokens).toBe(8192);
  });

  it('detects correct media_type from JPEG buffer (not hardcoded png)', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    // Minimal JPEG magic bytes
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);

    const provider = anthropic('claude-sonnet-4-6');
    await provider.extractFromImage({ image: jpegBuffer, prompt: fakePrompt });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.messages[0].content[0].source.media_type).toBe('image/jpeg');
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = anthropic('claude-sonnet-4-6');
    await expect(
      provider.extractFromImage({ image: fakeImage, prompt: fakePrompt }),
    ).rejects.toThrow('ANTHROPIC_API_KEY environment variable is not set');
  });

  it('wraps API errors with descriptive message', async () => {
    mockAnthropicCreate.mockRejectedValue(new Error('Invalid API key'));
    const provider = anthropic('claude-sonnet-4-6');
    await expect(
      provider.extractFromImage({ image: fakeImage, prompt: fakePrompt }),
    ).rejects.toThrow('Anthropic API error: Invalid API key');
  });

  it('handles response with multiple text blocks', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = anthropic('claude-sonnet-4-6');
    const result = await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });
    expect(result.content).toBe('{"a":1}');
  });

  it('parses data URLs with extra parameters', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = anthropic('claude-sonnet-4-6');
    const dataUrl = 'data:image/jpeg;charset=utf-8;base64,/9j/4AAQ';
    const result = await provider.extractFromImage({ image: dataUrl, prompt: fakePrompt });
    expect(result.content).toBe('{}');

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.messages[0].content[0].source.media_type).toBe('image/jpeg');
    expect(call.messages[0].content[0].source.data).toBe('/9j/4AAQ');
  });

  it('sends one image block per page for multi-page inputs', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = anthropic('claude-sonnet-4-6');
    const dataUrls = [
      'data:image/png;base64,AAA=',
      'data:image/png;base64,BBB=',
    ];

    await provider.extractFromImage({ image: dataUrls, prompt: fakePrompt });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.messages[0].content).toHaveLength(3);
    expect(call.messages[0].content[0].source.data).toBe('AAA=');
    expect(call.messages[0].content[1].source.data).toBe('BBB=');
    expect(call.messages[0].content[2].type).toBe('text');
  });

  it('sends native PDF as document block', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = anthropic('claude-sonnet-4-6');
    await provider.extractFromImage({ image: fakePdf, prompt: fakePrompt });

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.messages[0].content[0].type).toBe('document');
    expect(call.messages[0].content[0].source.media_type).toBe('application/pdf');
  });

  it('sets truncated flag when stop_reason is max_tokens', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"name":"Jan' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 200, output_tokens: 100 },
    });

    const provider = anthropic('claude-sonnet-4-6');
    const result = await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });
    expect(result.truncated).toBe(true);
    expect(result.content).toBe('{"name":"Jan');
  });
});

// ── Ollama Provider ────────────────────────────────────────────────────
describe('Ollama provider', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('sends correct request shape and returns normalized response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: '{"field":"value"}' },
        prompt_eval_count: 50,
        eval_count: 10,
      }),
    }) as unknown as typeof fetch;

    const provider = ollama('llama-3.2-vision');
    const result = await provider.extractFromImage({
      image: fakeImage,
      prompt: fakePrompt,
      systemPrompt: fakeSystemPrompt,
    });

    expect(result.content).toBe('{"field":"value"}');
    expect(result.usage).toEqual({ promptTokens: 50, completionTokens: 10, totalTokens: 60 });

    // Verify request shape
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('llama-3.2-vision');
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].images).toHaveLength(1);
  });

  it('uses custom OLLAMA_BASE_URL', async () => {
    process.env.OLLAMA_BASE_URL = 'http://myhost:9999';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{}' } }),
    }) as unknown as typeof fetch;

    const provider = ollama('llama-3.2-vision');
    await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://myhost:9999/api/chat');
  });

  it('strips trailing slash from OLLAMA_BASE_URL', async () => {
    process.env.OLLAMA_BASE_URL = 'http://myhost:9999/';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{}' } }),
    }) as unknown as typeof fetch;

    const provider = ollama('llama-3.2-vision');
    await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://myhost:9999/api/chat');
  });

  it('parses data URLs with extra parameters', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{}' } }),
    }) as unknown as typeof fetch;

    const dataUrl = 'data:image/png;charset=utf-8;base64,iVBORw0KGgo';
    const provider = ollama('llama-3.2-vision');
    await provider.extractFromImage({ image: dataUrl, prompt: fakePrompt });

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.messages[0].images[0]).toBe('iVBORw0KGgo');
  });

  it('sends one image per page for multi-page inputs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{}' } }),
    }) as unknown as typeof fetch;

    const dataUrls = [
      'data:image/png;base64,AAA=',
      'data:image/png;base64,BBB=',
      'data:image/png;base64,CCC=',
    ];
    const provider = ollama('llama-3.2-vision');
    await provider.extractFromImage({ image: dataUrls, prompt: fakePrompt });

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.messages[0].images).toEqual(['AAA=', 'BBB=', 'CCC=']);
  });

  it('rejects native PDF input because Ollama API path is image-only', async () => {
    const provider = ollama('llama-3.2-vision');

    await expect(
      provider.extractFromImage({ image: fakePdf, prompt: fakePrompt }),
    ).rejects.toThrow('Ollama provider does not support native PDF inputs');
  });

  it('handles connection errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const provider = ollama('llama-3.2-vision');
    await expect(
      provider.extractFromImage({ image: fakeImage, prompt: fakePrompt }),
    ).rejects.toThrow('Ollama connection error: ECONNREFUSED. Is Ollama running at http://localhost:11434?');
  });

  it('handles non-OK HTTP responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    }) as unknown as typeof fetch;

    const provider = ollama('llama-3.2-vision');
    await expect(
      provider.extractFromImage({ image: fakeImage, prompt: fakePrompt }),
    ).rejects.toThrow('Ollama API error (404): model not found');
  });

  it('omits system message when systemPrompt is not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{}' } }),
    }) as unknown as typeof fetch;

    const provider = ollama('llama-3.2-vision');
    await provider.extractFromImage({ image: fakeImage, prompt: fakePrompt });

    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });
});
