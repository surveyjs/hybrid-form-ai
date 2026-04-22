# Milestone 8 — Digital PDF Extraction Support

## Goal
Allow `createExtractor().extractFromImage()` to accept digital PDF inputs in addition to scanned image inputs.

## Instructions

### Core Pipeline

1. Keep the public extractor method name as `extractFromImage()` for backward compatibility.
2. Keep digital PDFs as native document inputs instead of converting them into images.
3. Run the existing pipeline without PDF rasterization:
   - optional preprocessing
   - unique ID / QR detection
   - adapter prompt generation
   - LLM provider call
   - JSON parsing, validation, and confidence scoring

### Utilities

1. Extend utility handling so binary/path/URL PDF inputs can be converted to base64 data URLs with `application/pdf` media type.
2. Support base64 data URLs when resolving binary document inputs.
3. Do not require `sharp` for native PDF extraction.

### Prompting

1. Update extractor and adapter prompt text so it refers to document inputs, including native PDFs.

### Tests

1. Add a focused extractor test that proves a PDF input is passed through without rasterization.
2. Add provider tests that validate native PDF request shape for providers that support PDF documents.
3. Add provider tests that validate clear rejection for providers that are image-only.

### Spec

1. Update `SPEC.md` to list digital PDF extraction as a supported capability.
2. Document native PDF provider behavior and provider-specific limitations.

## Acceptance Criteria

- `extractFromImage()` accepts a digital PDF buffer, path, or URL.
- PDF inputs are passed natively to providers that support document inputs.
- Prompt text reflects document inputs instead of only scanned images.
- Focused extractor, provider, and utility tests cover the native PDF path.
- `npm run test` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.