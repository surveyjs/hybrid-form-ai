/**
 * Core types for hybrid-form-ai
 */

/** Single document input — scanned image or digital PDF provided as a file path, URL, Buffer, or Uint8Array */
export type SingleImageInput = string | Buffer | Uint8Array;

/** Extractor input — a single document input or an ordered array of page images/document sources */
export type ImageInput = SingleImageInput | SingleImageInput[];

/** Per-field confidence score */
export interface FieldConfidence {
  fieldName: string;
  value: unknown;
  confidence: number;
  flagged: boolean;
}

/** Result returned by the extraction pipeline */
export interface ExtractionResult {
  /** Structured data matching the form schema */
  data: Record<string, unknown>;
  /** Detected unique ID / QR code (if any) */
  uniqueId: string | null;
  /** Per-field confidence scores */
  confidence: FieldConfidence[];
  /** Raw LLM response (for debugging) */
  rawResponse?: string;
  /** Token / cost metadata (if logCosts enabled) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost?: number;
  };
}

/** Options passed to createExtractor */
export interface ExtractorConfig {
  provider: import('../providers/base').LLMProvider;
  adapter: 'surveyjs' | 'json-schema' | 'custom';
  options?: ExtractionOptions;
  customAdapter?: import('../adapters/base').FormAdapter;
}

/** Extraction tuning options */
export interface ExtractionOptions {
  confidenceThreshold?: number;
  maxRetries?: number;
  logCosts?: boolean;
  preprocessImage?: boolean;
}

/** Input to extractFromImage */
export interface ExtractFromImageInput {
  image: ImageInput;
  formDefinition: Record<string, unknown>;
  uniqueIdHint?: string;
}
