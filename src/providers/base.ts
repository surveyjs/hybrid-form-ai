import type { ImageInput } from '../core/types';

/**
 * Common interface for all LLM providers.
 * Each provider (OpenAI, Anthropic, Ollama) implements this interface.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Send an image + text prompt to the vision model and get structured text back.
   */
  extractFromImage(params: {
    image: ImageInput;
    prompt: string;
    systemPrompt?: string;
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: string;
  truncated?: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Factory helper — providers export a function that returns an LLMProvider.
 */
export type ProviderFactory = (model: string, options?: Record<string, unknown>) => LLMProvider;
