import type { LLMProvider, LLMResponse, ProviderFactory } from './base';
import type { ImageInput } from '../core/types';

type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const SUPPORTED_MEDIA_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function toBase64(image: ImageInput): { data: string; mediaType: AnthropicMediaType } {
  if (typeof image === 'string') {
    const match = image.match(/^data:([^;,]+)[^,]*;base64,(.+)$/);
    if (match) {
      const mediaType = match[1];
      if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
        throw new Error(`Unsupported media type "${mediaType}". Anthropic supports: ${[...SUPPORTED_MEDIA_TYPES].join(', ')}`);
      }
      return { data: match[2], mediaType: mediaType as AnthropicMediaType };
    }
    throw new Error('Anthropic provider requires a base64 data URL, Buffer, or Uint8Array. HTTP URLs and file paths are not supported directly.');
  }
  const buffer = Buffer.isBuffer(image) ? image : Buffer.from(image);
  return { data: buffer.toString('base64'), mediaType: 'image/png' };
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
      const { data, mediaType } = toBase64(params.image);

      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: params.systemPrompt ?? '',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data },
                },
                { type: 'text', text: params.prompt },
              ],
            },
          ],
        });

        const content = response.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text)
          .join('');

        return {
          content,
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
