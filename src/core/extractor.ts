import type {
  ExtractorConfig,
  ExtractionResult,
  ExtractFromImageInput,
} from './types';

/**
 * Creates a configured extractor instance.
 *
 * @example
 * ```typescript
 * const extractor = createExtractor({
 *   provider: openai('gpt-4o'),
 *   adapter: 'surveyjs',
 * });
 * const result = await extractor.extractFromImage({ image, formDefinition });
 * ```
 */
export function createExtractor(_config: ExtractorConfig) {
  return {
    async extractFromImage(
      _input: ExtractFromImageInput
    ): Promise<ExtractionResult> {
      // TODO: Implement extraction pipeline
      // 1. Preprocess image (optional)
      // 2. Detect unique ID / QR code
      // 3. Convert form definition to prompt via adapter
      // 4. Send image + prompt to LLM provider
      // 5. Parse structured output
      // 6. Validate against schema + compute confidence
      throw new Error('Not yet implemented — see SPEC.md §4');
    },
  };
}
