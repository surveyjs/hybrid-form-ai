import type { LLMProvider, LLMResponse, ProviderFactory } from './base';
import type { ImageInput } from '../core/types';
import { imageInputToBase64Urls, imageToBase64 } from '../utils/image';

type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const SUPPORTED_MEDIA_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function toBase64(image: ImageInput): Promise<{ data: string; mediaType: AnthropicMediaType }> {
  if (Buffer.isBuffer(image) || image instanceof Uint8Array) {
    const buffer = Buffer.isBuffer(image) ? image : Buffer.from(image);
    return { data: buffer.toString('base64'), mediaType: 'image/png' };
  }

  const dataUrl = typeof image === 'string' && image.startsWith('data:')
    ? image
    : await imageToBase64(image);
  const match = dataUrl.match(/^data:([^;,]+)[^,]*;base64,(.+)$/);
  if (!match) {
    throw new Error('Anthropic provider requires a base64 data URL, Buffer, Uint8Array, file path, or image array input.');
  }
  const mediaType = match[1];
  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
    throw new Error(`Unsupported media type "${mediaType}". Anthropic supports: ${[...SUPPORTED_MEDIA_TYPES].join(', ')}`);
  }
  return { data: match[2], mediaType: mediaType as AnthropicMediaType };
}

async function toBase64List(image: ImageInput): Promise<Array<{ data: string; mediaType: AnthropicMediaType }>> {
  if (Array.isArray(image)) {
    const dataUrls = await imageInputToBase64Urls(image);
    return Promise.all(dataUrls.map((dataUrl) => toBase64(dataUrl)));
  }
  return [await toBase64(image)];
}

/**
 * Anthropic provider factory.
 *
 * @example
 * ```typescript
 * import { anthropic } from 'hybrid-form-ai/providers';
 * const provider = anthropic('claude-4-sonnet');
 * ```
 */
export const anthropic: ProviderFactory = (model = 'claude-sonnet-4-6', _options = {}) => {
  const maxTokens = (typeof _options.maxTokens === 'number' && _options.maxTokens > 0) ? _options.maxTokens : 16384;
  const provider: LLMProvider = {
    name: 'anthropic',
    model,
    async extractFromImage(params): Promise<LLMResponse> {
      let Anthropic: typeof import('@anthropic-ai/sdk').default;
      try {
        Anthropic = (await import('@anthropic-ai/sdk')).default;
      } catch {
        throw new Error('The "@anthropic-ai/sdk" package is required for the Anthropic provider. Install it with: npm install @anthropic-ai/sdk');
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set.');
      }

      const client = new Anthropic({ apiKey });
      const images = await toBase64List(params.image);

      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: params.systemPrompt ?? '',
          messages: [
            {
              role: 'user',
              content: [
                ...images.map(({ data, mediaType }) => ({
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: mediaType, data },
                })),
                { type: 'text', text: params.prompt + '\n\nIMPORTANT: Return ONLY the raw JSON object. Do NOT include any explanation, markdown formatting, or code fences.' },
              ],
            },
          ],
        });

        const truncated = response.stop_reason === 'max_tokens';

        const content = response.content
          .filter((block) => block.type === 'text')
          .map((block) => ('text' in block ? block.text : ''))
          .join('');

        return {
          content,
          truncated,
          usage: response.usage
            ? {
                promptTokens: response.usage.input_tokens ?? 0,
                completionTokens: response.usage.output_tokens ?? 0,
                totalTokens: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
              }
            : undefined,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Anthropic API error: ${message}`);
      }
    },
  };
  return provider;
};
