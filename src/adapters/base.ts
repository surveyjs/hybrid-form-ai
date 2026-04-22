import type { ZodType } from 'zod';

/**
 * Common interface for form adapters.
 * Adapters convert a form definition into an LLM-friendly prompt.
 */
export interface FormAdapter {
  readonly name: string;

  /**
   * Convert a form definition object into a structured text prompt
   * describing the fields, types, choices, and constraints.
   */
  toPrompt(formDefinition: Record<string, unknown>): string;

  /**
   * Return a Zod schema for validating LLM output.
   */
  toOutputSchema(formDefinition: Record<string, unknown>): ZodType;

  /**
   * Optionally normalize raw LLM JSON before schema validation.
   */
  normalizeResponseData?(formDefinition: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown>;
}
