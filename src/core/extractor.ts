import type {
  ExtractorConfig,
  ExtractionResult,
  ExtractFromImageInput,
  FieldConfidence,
} from './types';
import type { FormAdapter } from '../adapters/base';
import { SurveyJSAdapter } from '../adapters/surveyjs';
import { JsonSchemaAdapter } from '../adapters/json-schema';
import { preprocessImage, imageToBase64 } from '../utils/image';
import { detectUniqueId } from '../utils/qr';
import { z } from 'zod';

/** Extract expected field names from a Zod schema (ZodObject). */
function getSchemaKeys(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  return [];
}

function resolveAdapter(config: ExtractorConfig): FormAdapter {
  switch (config.adapter) {
    case 'surveyjs':
      return new SurveyJSAdapter();
    case 'json-schema':
      return new JsonSchemaAdapter();
    case 'custom':
      if (!config.customAdapter) {
        throw new Error('Custom adapter requires a "customAdapter" instance in the config');
      }
      return config.customAdapter;
    default:
      throw new Error(`Unknown adapter: ${config.adapter as string}`);
  }
}

const SYSTEM_PROMPT =
  'You are a document data extraction assistant. ' +
  'Extract field values from the scanned form image. ' +
  'Return valid JSON only, matching the specified field names exactly. ' +
  'For each field, include your confidence (0.0-1.0) in a parallel "_confidence" object. ' +
  'If a field is not visible or unreadable, use null.';

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
export function createExtractor(config: ExtractorConfig) {
  const adapter = resolveAdapter(config);
  const provider = config.provider;
  const opts = config.options ?? {};
  const maxRetries = opts.maxRetries ?? 2;
  const confidenceThreshold = opts.confidenceThreshold ?? 0.75;
  const shouldPreprocess = opts.preprocessImage ?? true;
  const logCosts = opts.logCosts ?? false;

  return {
    async extractFromImage(
      input: ExtractFromImageInput
    ): Promise<ExtractionResult> {
      // 1. Preprocess image (optional)
      const image = shouldPreprocess
        ? await preprocessImage(input.image)
        : input.image;

      // 2. Detect unique ID
      const idResult = await detectUniqueId(image);
      const uniqueId = idResult.id ?? input.uniqueIdHint ?? null;

      // 3. Generate prompt
      const fieldPrompt = adapter.toPrompt(input.formDefinition);
      const basePrompt = fieldPrompt;

      // 4. Get output schema for validation
      const outputSchema = adapter.toOutputSchema(input.formDefinition);

      // 5. Convert image to base64
      const imageBase64 = await imageToBase64(image);

      // Retry loop (steps 4-7)
      const errors: string[] = [];
      let prompt = basePrompt;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Call LLM provider
          const response = await provider.extractFromImage({
            image: imageBase64,
            prompt,
            systemPrompt: SYSTEM_PROMPT,
          });

          const rawContent = response.content;

          // Strip markdown code fences (e.g. ```json ... ```) that LLMs may wrap around JSON
          const jsonContent = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

          // Parse JSON response
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(jsonContent);
          } catch {
            throw new Error(`Invalid JSON in LLM response: ${rawContent.slice(0, 200)}`);
          }

          // Extract _confidence object before validation
          const confidenceMap = (parsed._confidence ?? {}) as Record<string, number>;
          const dataWithoutConfidence = { ...parsed };
          delete dataWithoutConfidence._confidence;

          // Track which fields were null (for confidence scoring) then
          // convert null → undefined so Zod .optional() accepts them
          const nullFields = new Set<string>();
          for (const [key, val] of Object.entries(dataWithoutConfidence)) {
            if (val === null) {
              nullFields.add(key);
              dataWithoutConfidence[key] = undefined;
            }
          }

          // Validate with Zod
          const validationResult = outputSchema.safeParse(dataWithoutConfidence);
          if (!validationResult.success) {
            const zodErrors = validationResult.error.issues
              .map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`)
              .join('; ');
            throw new Error(`Schema validation failed: ${zodErrors}`);
          }

          const data = validationResult.data as Record<string, unknown>;

          // Restore null for fields that were originally null
          for (const field of nullFields) {
            data[field] = null;
          }

          // Compute confidence scores over all schema-expected keys
          // so consumers always get a consistent shape, even for
          // optional fields the LLM omitted entirely.
          const schemaKeys = getSchemaKeys(outputSchema);
          const allKeys = schemaKeys.length > 0
            ? schemaKeys
            : Object.keys(data);

          const confidence: FieldConfidence[] = allKeys.map((fieldName) => {
            const value = fieldName in data ? data[fieldName] : null;
            // Ensure omitted optional fields appear in data as null
            if (!(fieldName in data)) {
              data[fieldName] = null;
            }
            let fieldConfidence: number;
            if (confidenceMap[fieldName] !== undefined) {
              fieldConfidence = confidenceMap[fieldName];
            } else {
              fieldConfidence = value === null || value === undefined ? 0.0 : 1.0;
            }
            return {
              fieldName,
              value,
              confidence: fieldConfidence,
              flagged: fieldConfidence < confidenceThreshold,
            };
          });

          // Build result
          const result: ExtractionResult = {
            data,
            uniqueId,
            confidence,
            rawResponse: rawContent,
          };

          if (logCosts && response.usage) {
            result.usage = {
              promptTokens: response.usage.promptTokens,
              completionTokens: response.usage.completionTokens,
              totalTokens: response.usage.totalTokens,
            };
          }

          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Attempt ${attempt + 1}: ${message}`);

          if (attempt < maxRetries) {
            prompt = `${basePrompt}\n\nYour previous response was invalid: ${message}. Please return valid JSON.`;
          }
        }
      }

      throw new Error(
        `Extraction failed after ${maxRetries + 1} attempts. Errors:\n${errors.join('\n')}`
      );
    },
  };
}
