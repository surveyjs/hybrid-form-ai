# SPEC.md

**Project:** hybrid-form-ai  
**Version:** 0.1.0 (MVP Draft)  
**Last Updated:** April 15, 2026  
**Status:** Living Document — This is the authoritative specification for the project.

## 1. Overview

`hybrid-form-ai` is a lightweight, open-source TypeScript npm package that enables **hybrid paper + digital form collection** using multimodal Large Language Models (LLMs).

You design a form **once** using SurveyJS (or any JSON-based schema), generate printable PDFs with unique IDs or QR codes, collect responses both online and on paper, then use this library to intelligently extract structured data from scanned or photographed paper forms and merge them with online responses.

### Primary Goal
Provide a simple, flexible, and cost-effective open-source alternative to expensive enterprise Intelligent Document Processing (IDP) solutions such as Rossum, ABBYY FlexiCapture, and Hyperscience.

## 2. Key Features

- Generic support for JSON form definitions with **first-class SurveyJS adapter**
- Swappable multimodal LLM providers (OpenAI, Anthropic, Ollama, and more)
- Intelligent extraction from scanned/photographed forms (text, checkboxes, tables, handwriting)
- Automatic unique ID / QR code detection from images
- Schema-aware prompting and structured JSON output
- Confidence scoring and low-confidence field flagging
- Response merging utility (online + paper responses)
- Self-hostable and production-ready

## 3. High-Level Architecture

```mermaid
flowchart TD
    A[Form Definition<br/>(SurveyJS JSON)] --> C[hybrid-form-ai Core]
    B[Scanned Image / Photo] --> C
    C --> D[Image Preprocessing + QR/ID Detection]
    C --> E[Adapter Layer\n(SurveyJS → Prompt)]
    C --> F[LLM Provider Layer]
    F --> G[Structured Output Parsing]
    G --> H[Validation + Confidence Scoring]
    H --> I[Merging with Online Responses]
    I --> J[Clean Structured JSON Output]
```

## 4. Public API (Target Design)

```typescript
import { createExtractor } from 'hybrid-form-ai';
import { openai, anthropic, ollama } from 'hybrid-form-ai/providers';

const extractor = createExtractor({
  provider: openai('gpt-4o'),           // Easy switching between providers
  adapter: 'surveyjs',                  // 'surveyjs' | 'json-schema' | 'custom'
  options: {
    confidenceThreshold: 0.75,
    maxRetries: 2,
    logCosts: true,
  }
});

const result = await extractor.extractFromImage({
  image: imageBuffer,                   // Buffer | Uint8Array | string (path or URL)
  formDefinition: surveyJson,           // Original SurveyJS JSON
  uniqueIdHint: 'optional-fallback-id'
});

console.log(result.data);               // Structured responses matching form schema
```

### Additional Exports
- `detectUniqueId(image)` – Standalone QR / barcode + text detection
- `mergeResponses(onlineData, paperExtractions)` – Deduplication by unique ID

## 5. LLM Providers

**Supported from Day One:**
- OpenAI (`gpt-4o`, `gpt-4o-mini`)
- Anthropic (`claude-4-sonnet`, `claude-3-5-sonnet`)
- Ollama (local vision models: `llama-3.2-vision`, `qwen2-vl`, etc.)

**Design:**
- Lightweight abstraction layer (`providers/base.ts`)
- Each provider implements a common interface for structured output
- Easy to add new providers (Grok, Gemini, Mistral, etc.)

## 6. Adapters

- **SurveyJS Adapter** (highest priority): Converts SurveyJS JSON into clear, descriptive prompts that include question titles, types, choices, and constraints.
  It also normalizes extracted responses into canonical SurveyJS data keys/values before validation:
  - Question keys: `title`/display label -> question `name`
  - `multipletext` item keys: item `title` -> item `name`
  - Matrix column keys: column `title`/`text` -> column `name` (or `value` when `name` is absent)
  - Matrix row keys: row `text` -> row `value`
  - Choice values for `radiogroup`, `dropdown`, `checkbox`, `tagbox`, `ranking`, `imagepicker`: display `text` -> canonical `value`
  - `signaturepad` fields: captured signature image -> Base64 string value
- **JSON Schema Adapter**: Support for standard JSON Schema.
- **Custom Adapter**: Simple interface for users to define their own mapping.

## 7. Non-Functional Requirements

- Written in **TypeScript** with strong typing
- Use **Zod** for output schema validation
- Lightweight dependencies (sharp for image processing, official LLM SDKs)
- Support for Docker and serverless environments
- Clear error handling and retry logic
- Optional cost tracking and logging
- No persistent storage of images or sensitive data by default

## 8. Planned Project Structure

```bash
hybrid-form-ai/
├── src/
│   ├── core/                 # Extraction engine, main logic
│   ├── providers/            # openai.ts, anthropic.ts, ollama.ts, base.ts
│   ├── adapters/             # surveyjs.ts, json-schema.ts, base.ts
│   ├── utils/                # image.ts, qr.ts, merging.ts
│   └── index.ts
├── examples/
│   ├── surveyjs-hybrid/      # Full end-to-end example
│   └── custom-adapter/
├── docs/
├── SPEC.md                   # This file
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## 9. Roadmap

**MVP (Phase 1)**
- Core extraction pipeline
- SurveyJS adapter
- OpenAI + Anthropic + Ollama providers
- Unique ID / QR detection
- Basic merging utility
- Comprehensive tests and examples

**Phase 2**
- Additional providers
- Batch processing
- REST API example + Docker setup
- Human-in-the-loop review stub
- Performance optimizations

## 10. Open Questions

- Should we use Vercel AI SDK as base for providers or build a minimal custom layer?
- Best image preprocessing strategy before sending to vision models
- Default model choice for cost vs quality balance

---

**This SPEC.md is a living document.**  
Update it whenever major design decisions are made or features are added.
