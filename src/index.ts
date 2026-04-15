// hybrid-form-ai — Main entry point
// See SPEC.md for full API design

export { createExtractor } from './core/extractor';
export { detectUniqueId } from './utils/qr';
export { mergeResponses } from './utils/merging';

export type {
  ExtractorConfig,
  ExtractionResult,
  ExtractionOptions,
  FieldConfidence,
} from './core/types';

export type { LLMProvider } from './providers/base';
export type { FormAdapter } from './adapters/base';
export type { MergeOptions, MergedRecord } from './utils/merging';
