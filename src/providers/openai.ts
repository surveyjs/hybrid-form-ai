import type { LLMProvider, LLMResponse, ProviderFactory } from './base';
import type { ImageInput } from '../core/types';
import { imageInputToBase64Urls, imageToBase64 } from '../utils/image';

async function toBase64DataUrl(image: ImageInput): Promise<string> {
  if (typeof image === 'string' && (image.startsWith('data:') || image.startsWith('http://') || image.startsWith('https://'))) {
    return image;
  }
  if (Buffer.isBuffer(image) || image instanceof Uint8Array) {
    const buffer = Buffer.isBuffer(image) ? image : Buffer.from(image);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
  return imageToBase64(image);
}

async function toBase64DataUrls(image: ImageInput): Promise<string[]> {
  if (Array.isArray(image)) {
    return imageInputToBase64Urls(image);
  }
  return [await toBase64DataUrl(image)];
}

/**
 * OpenAI provider factory.
 *
 * @example
 * ```typescript
 * import { openai } from 'hybrid-form-ai/providers';
 * const provider = openai('gpt-4o');
 * ```
 */
export const openai: ProviderFactory = (model = 'gpt-4o', _options = {}) => {
  const provider: LLMProvider = {
    name: 'openai',
    model,
    async extractFromImage(params): Promise<LLMResponse> {
      let OpenAI: typeof import('openai').default;
      try {
        OpenAI = (await import('openai')).default;
      } catch {
        throw new Error('The "openai" package is required for the OpenAI provider. Install it with: npm install openai');
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set.');
      }

      const client = new OpenAI({ apiKey });
      const imageUrls = await toBase64DataUrls(params.image);

      const messages: Array<{ role: string; content: unknown }> = [];
      if (params.systemPrompt) {
        messages.push({ role: 'system', content: params.systemPrompt });
      }
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: params.prompt },
          ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      });

      try {
        const response = await client.chat.completions.create({
          model,
          messages: messages as Parameters<typeof client.chat.completions.create>[0]['messages'],
          response_format: { type: 'json_object' },
        });

        const content = response.choices?.[0]?.message?.content ?? '';
        const usage = response.usage;

        return {
          content,
          usage: usage
            ? {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
              }
            : undefined,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`OpenAI API error: ${message}`);
      }
    },
  };
  return provider;
};
