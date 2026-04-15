import type { LLMProvider, LLMResponse, ProviderFactory } from './base';
import type { ImageInput } from '../core/types';

function toBase64String(image: ImageInput): string {
  if (typeof image === 'string') {
    const match = image.match(/^data:[^;,]+[^,]*;base64,(.+)$/);
    if (match) {
      return match[1];
    }
    throw new Error('Ollama provider requires a base64 data URL, Buffer, or Uint8Array. HTTP URLs and file paths are not supported directly.');
  }
  const buffer = Buffer.isBuffer(image) ? image : Buffer.from(image);
  return buffer.toString('base64');
}

/**
 * Ollama provider factory (local vision models).
 *
 * @example
 * ```typescript
 * import { ollama } from 'hybrid-form-ai/providers';
 * const provider = ollama('llama-3.2-vision');
 * ```
 */
export const ollama: ProviderFactory = (model = 'llama-3.2-vision', _options = {}) => {
  const provider: LLMProvider = {
    name: 'ollama',
    model,
    async extractFromImage(params): Promise<LLMResponse> {
      const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
      const url = `${baseUrl}/api/chat`;
      const imageBase64 = toBase64String(params.image);

      const messages: Array<{ role: string; content: string; images?: string[] }> = [];
      if (params.systemPrompt) {
        messages.push({ role: 'system', content: params.systemPrompt });
      }
      messages.push({
        role: 'user',
        content: params.prompt,
        images: [imageBase64],
      });

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            format: 'json',
          }),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Ollama connection error: ${message}. Is Ollama running at ${baseUrl}?`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama API error (${response.status}): ${body}`);
      }

      const json = (await response.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const content = json.message?.content ?? '';
      const promptTokens = json.prompt_eval_count ?? 0;
      const completionTokens = json.eval_count ?? 0;

      return {
        content,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    },
  };
  return provider;
};
