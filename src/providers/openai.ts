import type { LLMProvider, LLMResponse, ProviderFactory } from './base';
import type { ImageInput } from '../core/types';
import { imageInputToBase64Urls, imageToBase64 } from '../utils/image';

interface EncodedInput {
  dataUrl: string;
  mimeType: string;
}

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function parseDataUrl(dataUrl: string): EncodedInput {
  const match = dataUrl.match(/^data:([^;,]+)[^,]*;base64,/);
  if (!match) {
    throw new Error('OpenAI provider requires base64 data URL, Buffer, Uint8Array, file path, or URL input.');
  }
  return { dataUrl, mimeType: match[1] };
}

async function toEncodedInputs(image: ImageInput): Promise<EncodedInput[]> {
  if (Array.isArray(image)) {
    const urls = await imageInputToBase64Urls(image);
    return urls.map((url) => parseDataUrl(url));
  }
  const url = await imageToBase64(image);
  return [parseDataUrl(url)];
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
      const encodedInputs = await toEncodedInputs(params.image);
      const hasPdf = encodedInputs.some((item) => item.mimeType === 'application/pdf');

      try {
        if (hasPdf) {
          const responsesApi = (client as unknown as {
            responses?: { create?: (args: unknown) => Promise<unknown> };
          }).responses;

          if (!responsesApi?.create) {
            throw new Error('OpenAI SDK does not expose responses API in this runtime');
          }

          const response = await responsesApi.create({
            model,
            instructions: params.systemPrompt,
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: params.prompt + '\n\nIMPORTANT: Return ONLY the raw JSON object. Do NOT include any explanation, markdown formatting, or code fences.',
                  },
                  ...encodedInputs.map((item) => {
                    if (item.mimeType === 'application/pdf') {
                      return {
                        type: 'input_file',
                        filename: 'document.pdf',
                        file_data: item.dataUrl,
                      };
                    }

                    if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(item.mimeType)) {
                      throw new Error(`Unsupported media type "${item.mimeType}" for OpenAI provider.`);
                    }

                    return {
                      type: 'input_image',
                      image_url: item.dataUrl,
                    };
                  }),
                ],
              },
            ],
          }) as {
            output_text?: string;
            usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
          };

          return {
            content: response.output_text ?? '',
            usage: response.usage
              ? {
                  promptTokens: response.usage.input_tokens ?? 0,
                  completionTokens: response.usage.output_tokens ?? 0,
                  totalTokens: response.usage.total_tokens
                    ?? ((response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0)),
                }
              : undefined,
          };
        }

        const messages: Array<{ role: string; content: unknown }> = [];
        if (params.systemPrompt) {
          messages.push({ role: 'system', content: params.systemPrompt });
        }
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: params.prompt },
            ...encodedInputs.map((item) => {
              if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(item.mimeType)) {
                throw new Error(`Unsupported media type "${item.mimeType}" for OpenAI provider.`);
              }
              return { type: 'image_url', image_url: { url: item.dataUrl } };
            }),
          ],
        });

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
