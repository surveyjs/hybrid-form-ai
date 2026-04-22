# Milestone 5 — Core Extraction Pipeline

## Goal
Wire up the full end-to-end extraction pipeline in `createExtractor()`.

## Instructions

### Extractor (`src/core/extractor.ts`)

**`createExtractor(config)` function:**
1. Resolve the adapter by name:
   - `'surveyjs'` → instantiate `SurveyJSAdapter`
   - `'json-schema'` → instantiate `JsonSchemaAdapter`
   - `'custom'` → use `config.customAdapter` (throw if not provided)
2. Return an object with `extractFromImage(input)` method

**`extractFromImage(input)` method — full pipeline:**

1. **Preprocess Image** (optional)
   - If `options.preprocessImage` is true (or default), call `preprocessImage(input.image)`
   - Otherwise use raw image

2. **Detect Unique ID**
   - Call `detectUniqueId(image)` to scan for QR codes / barcodes
   - If detection returns null and `uniqueIdHint` is provided, use the hint as fallback

3. **Generate Prompt**
    - Call `adapter.toPrompt(input.formDefinition)` to get the field descriptions
    - Build a system prompt that instructs the LLM:
       - "You are a document data extraction assistant"
       - "Extract field values from the scanned form image"
       - "Return valid JSON only, using canonical schema keys/values (`name`/`value`)"
      - "For `signaturepad` fields, return Base64-encoded image strings"
       - "For each field, include your confidence (0.0-1.0) in a parallel `_confidence` object"
       - "If a field is not visible or unreadable, use null"

4. **Call LLM Provider**
   - Convert image to base64 via `imageToBase64()`
   - Call `provider.extractFromImage({ image, prompt, systemPrompt })`

5. **Parse JSON Response**
   - Parse the LLM response content as JSON
   - If parsing fails, throw a descriptive error (will be caught by retry logic)

6. **Normalize Adapter-Specific Keys/Values**
   - If adapter provides normalization logic, normalize parsed data before schema validation
   - Accept label-based output from OCR/LLM and map to canonical schema keys/values (for example `title`/`text` -> `name`/`value`)

7. **Validate with Zod**
   - Get the Zod schema from `adapter.toOutputSchema(input.formDefinition)`
   - Validate the parsed data against the schema
   - If validation fails, throw (will be caught by retry logic)

8. **Compute Confidence Scores**
   - If the LLM returned a `_confidence` object, use those values
   - Otherwise: 1.0 for non-null present fields, 0.0 for null/missing fields
   - Flag fields below `options.confidenceThreshold` (default: 0.75)
   - Build the `FieldConfidence[]` array

9. **Return ExtractionResult**
   - `data`: the validated field values (without `_confidence`)
   - `uniqueId`: detected ID or null
   - `confidence`: per-field confidence array
   - `rawResponse`: the raw LLM content string (for debugging)
   - `usage`: token counts and estimated cost (if `logCosts` is true)

### Retry Logic
- Wrap steps 4-8 in a retry loop
- On JSON parse failure or Zod validation failure:
  - Append to the prompt: "Your previous response was invalid: {error}. Please return valid JSON."
  - Retry up to `options.maxRetries` times (default: 2)
- After all retries exhausted, throw with accumulated error details

### Cost Tracking
- If `options.logCosts` is true and provider returns usage:
  - Include `usage` in the result
  - Optionally estimate cost based on known model pricing (can be a simple lookup table)

### Unit Tests (`src/core/__tests__/`)
- Create a mock provider that returns predefined JSON
- Test successful extraction end-to-end with mock provider + surveyjs adapter
- Test retry logic: mock provider returns invalid JSON first, valid on retry
- Test confidence scoring: fields with null values get 0.0, present fields get 1.0
- Test unique ID fallback to hint when detection returns null
- Test adapter resolution: 'surveyjs', 'json-schema', 'custom'
- Test error when 'custom' adapter is used without providing customAdapter

### Files to Modify
- `src/core/extractor.ts` (main implementation)
- `src/core/types.ts` (add any needed types)
- `src/core/index.ts` (update exports if needed)
- `src/core/__tests__/extractor.test.ts` (expand significantly)

### Acceptance Criteria
- Full pipeline works end-to-end with mock provider
- Retry logic recovers from malformed LLM responses
- Confidence scores are computed and fields flagged correctly
- Unique ID detection integrates with fallback hint
- Cost tracking works when enabled
- `npm run test` passes
- `npm run typecheck` passes
- `npm run lint` passes
