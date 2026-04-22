# Milestone 3 — Adapter Layer

## Goal
Implement SurveyJS and JSON Schema adapters that convert form definitions into LLM prompts and Zod output schemas.

## Instructions

### SurveyJS Adapter (`src/adapters/surveyjs.ts`)

**`toPrompt(formDefinition)` method:**
- Walk the SurveyJS JSON definition structure: `pages` → `elements` (questions)
- For each question, output a numbered, human-readable description including:
  - Field name (the `name` property)
  - Title (the `title` property, fallback to `name`)
  - Question type
  - Whether it's required (`isRequired`)
  - Available choices/options (for radiogroup, checkbox, dropdown)
  - Constraints (min/max values, input masks, validators)
- Handle these question types:
  - `text` — single-line text input (note `inputType` variants: email, number, date, etc.)
  - `comment` — multi-line text
  - `radiogroup` — single choice from list
  - `checkbox` — multiple choices from list
  - `tagbox` — multi-select dropdown (same data shape as checkbox)
  - `dropdown` — single choice from dropdown
  - `rating` — numeric rating (include rateMin, rateMax)
  - `boolean` — true/false
  - `matrix` — grid of rows × columns (single choice per row)
  - `matrixdynamic` — dynamic table with typed columns
  - `matrixdropdown` — grid of rows × columns with dropdown/checkbox/text cells per column
  - `multipletext` — group of labeled text inputs (each item has a `name` and `title`)
  - `ranking` — ordered list of choices (user ranks items by preference)
  - `imagepicker` — single or multiple choice from image options (extract by choice value/text)
  - `imagemap` — clickable regions on an image (extract selected region names)
  - `slider` — numeric slider with min/max/step (extract numeric value)
  - `signaturepad` — signature image capture (extract as Base64 string)
  - `boolean` — true/false toggle
  - `signature` — skip (handwritten signature, cannot reliably extract as data)
  - `html` — skip (display-only, no data to extract)
  - `image` — skip (display-only, no data to extract)
  - `file` — skip (cannot extract from image)
  - `panel` — recurse into nested elements (layout container, no data of its own)
  - `paneldynamic` — dynamic list of panels with repeated elements (similar to matrixdynamic but presented as repeated panel sections rather than a table grid)
- The prompt should instruct the LLM to return a JSON object with field names as keys
- Include clear instructions about expected value formats per type
- Clarify canonical output expectations in the prompt and schema notes:
  - Use question `name` as the canonical key even when the form shows a `title`
  - For `signaturepad`, return a Base64-encoded image string value
  - For `multipletext`, use item `name` keys even if extracted labels use item `title`
  - For matrix types, use canonical row `value` and column `name` (or `value` fallback)
  - For ItemValue arrays (`choices`, `rows`), map display `text` back to canonical `value`

**`toOutputSchema(formDefinition)` method:**
- Return a Zod schema object matching the expected SurveyJS result shape
- Apply normalization before validation so label-based OCR/LLM output is accepted and converted to canonical keys/values:
  - question `title` -> question `name`
  - `multipletext.items[].title` -> `multipletext.items[].name`
  - matrix column `title`/`text` -> column `name` (or `value` fallback)
  - matrix row `text` -> row `value`
  - ItemValue `text` -> `value` for single and multi-choice results
- Map SurveyJS question types to Zod types:
  - `text` → `z.string()` (or `z.number()` for inputType=number)
  - `comment` → `z.string()`
  - `radiogroup` / `dropdown` → `z.string()` (or `z.enum()` if choices are fixed)
  - `checkbox` / `tagbox` → `z.array(z.string())`
  - `rating` → `z.number()`
  - `boolean` → `z.boolean()`
  - `matrix` → `z.record(z.string())` (row name → selected column)
  - `matrixdynamic` → `z.array(z.record(z.unknown()))` (array of row objects)
  - `matrixdropdown` → `z.record(z.record(z.unknown()))` (row name → { column name → value })
  - `paneldynamic` → `z.array(z.record(z.unknown()))` (array of panel entry objects, same shape as matrixdynamic)
  - `multipletext` → `z.record(z.string())` (item name → text value)
  - `ranking` → `z.array(z.string())` (ordered list of choice values)
  - `imagepicker` → `z.string()` (single select) or `z.array(z.string())` (multi select)
  - `imagemap` → `z.string()` or `z.array(z.string())` (selected region names)
  - `slider` → `z.number()`
  - `signaturepad` → `z.string()` (Base64-encoded image string)
  - `signature` → skip
  - `html` → skip
  - `image` → skip
- Mark required fields with appropriate Zod validation
- Optional fields should use `.optional()` or `.nullable()`

### JSON Schema Adapter (`src/adapters/json-schema.ts`)
- Implement a basic adapter that converts standard JSON Schema `properties` into:
  - A prompt listing each property with its type and description
  - A Zod schema mapping JSON Schema types to Zod types
- Support: `string`, `number`, `integer`, `boolean`, `array`, `object`
- Handle `required` array from JSON Schema
- Handle `enum` values

### Unit Tests (`src/adapters/__tests__/`)
- Test with at least 3 sample SurveyJS forms:
  1. Simple form: text, radiogroup, comment (basic types)
  2. Complex form: matrix, rating, checkbox, dropdown (advanced types)
  3. Nested form: panels with nested elements, required fields
- Verify prompt output contains all field names, types, and choices
- Verify Zod schema validates correct data and rejects invalid data
- Test JSON Schema adapter with a sample schema

### Files to Modify
- `src/adapters/base.ts` (update interface if needed)
- `src/adapters/surveyjs.ts`
- `src/adapters/json-schema.ts`
- `src/adapters/index.ts`
- Create `src/adapters/__tests__/surveyjs.test.ts`
- Create `src/adapters/__tests__/json-schema.test.ts`

### Acceptance Criteria
- SurveyJS adapter generates clear, structured prompts from form JSON
- Zod schemas correctly validate expected output shapes
- All listed question types are handled
- `file`, `html`, `image`, `signature` types are explicitly skipped
- Nested panels are recursed correctly
- `npm run test` passes
- `npm run typecheck` passes
- `npm run lint` passes
