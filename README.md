# hybrid-form-ai

[![CI](https://github.com/surveyjs/hybrid-form-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/surveyjs/hybrid-form-ai/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/hybrid-form-ai.svg)](https://www.npmjs.com/package/hybrid-form-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Hybrid paper + digital form collection powered by multimodal LLMs.**

Design a form once, collect responses online *and* on paper, then use AI to extract structured data from scanned/photographed paper forms and merge everything together.

A lightweight, open-source alternative to enterprise IDP solutions like Rossum, ABBYY FlexiCapture, and Hyperscience.

## Features

- **SurveyJS-first** — First-class adapter for SurveyJS JSON form definitions
- **Multi-provider LLMs** — OpenAI, Anthropic, Ollama (local models) out of the box
- **Intelligent extraction** — Text, checkboxes, tables, handwriting from scanned forms
- **Multi-page extraction** — Pass an ordered array of page images for multi-page paper forms
- **Native PDF extraction** — Pass digital PDFs directly to providers that support document inputs
- **QR / unique ID detection** — Automatic form identification from images
- **Confidence scoring** — Flag low-confidence fields for human review
- **Response merging** — Combine online + paper responses by unique ID
- **Schema-aware prompting** — LLM outputs validated against your form schema with Zod

## Installation

```bash
npm install hybrid-form-ai
```

## Quick Start

```typescript
import { createExtractor } from 'hybrid-form-ai';
import { openai } from 'hybrid-form-ai/providers';
import { readFileSync } from 'fs';

// 1. Create an extractor with your preferred LLM provider
const extractor = createExtractor({
  provider: openai('gpt-4o'),
  adapter: 'surveyjs',
  options: {
    confidenceThreshold: 0.75,
    maxRetries: 2,
  }
});

// 2. Load your form input (scanned image(s) or native PDF) and form definition
const image = [
  readFileSync('./scanned-form-page-1.png'),
  readFileSync('./scanned-form-page-2.png'),
];
const formDefinition = JSON.parse(readFileSync('./survey.json', 'utf-8'));

// 3. Extract structured data from the provided form input
const result = await extractor.extractFromImage({
  image,
  formDefinition,
});

console.log(result.data);          // Structured responses matching schema
console.log(result.uniqueId);      // Detected QR / barcode ID
console.log(result.confidence);    // Per-field confidence scores

// Single-page forms are also supported:
// image: readFileSync('./scanned-form.png')
// Native PDF is also supported for providers with document input support:
// image: readFileSync('./digital-form.pdf')
```

## PDF Provider Notes

- OpenAI provider: supports native PDF input.
- Anthropic provider: supports native PDF input.
- Ollama provider: current API path is image-only and does not accept native PDF input.

## Switching Providers

```typescript
import { openai, anthropic, ollama } from 'hybrid-form-ai/providers';

// OpenAI
createExtractor({ provider: openai('gpt-4o') });

// Anthropic
createExtractor({ provider: anthropic('claude-4-sonnet') });

// Local with Ollama (no API key needed)
createExtractor({ provider: ollama('llama-3.2-vision') });
```

## Standalone Utilities

```typescript
import { detectUniqueId, mergeResponses } from 'hybrid-form-ai';

// Detect QR code or unique ID from an image
const id = await detectUniqueId(imageBuffer);

// Merge online and paper responses
const merged = mergeResponses(onlineResponses, paperExtractions);
```

## Adapters

| Adapter | Description |
|---------|-------------|
| `surveyjs` | Converts SurveyJS JSON into optimized LLM prompts |
| `json-schema` | Standard JSON Schema support |
| `custom` | Bring your own adapter via a simple interface |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |

## Demo

See the [hybrid-form-ai-demo](https://github.com/surveyjs/hybrid-form-ai-demo) repository for a full working demo.

## Documentation

- [SPEC.md](./SPEC.md) — Full project specification
- [docs/build-plan.md](./docs/build-plan.md) — Build plan and milestones
- [docs/architecture.md](./docs/architecture.md) — Architecture details
- [examples/](./examples/) — Working examples

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Contributing

Contributions are welcome! Please read the spec and build plan before starting work.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

[MIT](./LICENSE)
