import { describe, it, expect, vi } from 'vitest';
import { createExtractor } from '../extractor';
import type { LLMProvider } from '../../providers/base';
import type { FormAdapter } from '../../adapters/base';
import { z } from 'zod';

// Minimal PNG buffer (1x1 transparent pixel)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQIHWNgAAIABQABNjN9GQAAAABJRBUlEQJggg==',
  'base64',
);

function createMockProvider(responses: Array<{ content: string; truncated?: boolean; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>): LLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    model: 'mock-model',
    extractFromImage: vi.fn(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return resp;
    }),
  };
}

const simpleSurveyDef = {
  pages: [
    {
      elements: [
        { type: 'text', name: 'firstName', title: 'First Name', isRequired: true },
        { type: 'text', name: 'lastName', title: 'Last Name', isRequired: true },
        { type: 'text', name: 'email', title: 'Email', inputType: 'email' },
      ],
    },
  ],
};

const multipleTextSurveyDef = {
  pages: [
    {
      elements: [
        {
          type: 'multipletext',
          name: 'contacts',
          title: 'Contacts',
          isRequired: true,
          items: [
            { name: 'phone', title: 'Phone Number' },
            { name: 'fax', title: 'Fax Number' },
          ],
        },
      ],
    },
  ],
};

const titleMappedSurveyDef = {
  pages: [
    {
      elements: [
        { type: 'text', name: 'firstName', title: 'First Name', isRequired: true },
        {
          type: 'multipletext',
          name: 'contacts',
          title: 'Contact Information',
          isRequired: true,
          items: [
            { name: 'phone', title: 'Phone Number' },
            { name: 'fax', title: 'Fax Number' },
          ],
        },
      ],
    },
  ],
};

const simpleJsonSchemaDef = {
  type: 'object',
  properties: {
    firstName: { type: 'string', description: 'First name' },
    lastName: { type: 'string', description: 'Last name' },
    age: { type: 'number', description: 'Age' },
  },
  required: ['firstName', 'lastName'],
};

describe('createExtractor', () => {
  it('returns an object with extractFromImage method', () => {
    const extractor = createExtractor({
      provider: createMockProvider([{ content: '{}' }]),
      adapter: 'surveyjs',
    });

    expect(extractor).toBeDefined();
    expect(typeof extractor.extractFromImage).toBe('function');
  });

  describe('adapter resolution', () => {
    it('resolves surveyjs adapter', () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'John', lastName: 'Doe', email: 'john@test.com' }) },
      ]);
      const extractor = createExtractor({ provider, adapter: 'surveyjs' });
      expect(extractor).toBeDefined();
    });

    it('resolves json-schema adapter', () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'John', lastName: 'Doe', age: 30 }) },
      ]);
      const extractor = createExtractor({ provider, adapter: 'json-schema' });
      expect(extractor).toBeDefined();
    });

    it('resolves custom adapter when customAdapter is provided', () => {
      const customAdapter: FormAdapter = {
        name: 'test-custom',
        toPrompt: () => 'Extract name field',
        toOutputSchema: () => z.object({ name: z.string() }),
      };
      const provider = createMockProvider([{ content: JSON.stringify({ name: 'Test' }) }]);
      const extractor = createExtractor({
        provider,
        adapter: 'custom',
        customAdapter,
      });
      expect(extractor).toBeDefined();
    });

    it('throws when custom adapter is used without providing customAdapter', () => {
      const provider = createMockProvider([{ content: '{}' }]);
      expect(() =>
        createExtractor({ provider, adapter: 'custom' })
      ).toThrow('Custom adapter requires a "customAdapter" instance in the config');
    });
  });

  describe('end-to-end extraction with mock provider', () => {
    it('extracts data successfully with surveyjs adapter', async () => {
      const responseData = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
      const provider = createMockProvider([{ content: JSON.stringify(responseData) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data).toEqual(responseData);
      expect(result.rawResponse).toBe(JSON.stringify(responseData));
      expect(result.confidence).toHaveLength(3);
      expect(provider.extractFromImage).toHaveBeenCalledTimes(1);
    });

    it('extracts data successfully with json-schema adapter', async () => {
      const responseData = { firstName: 'Jane', lastName: 'Smith', age: 25 };
      const provider = createMockProvider([{ content: JSON.stringify(responseData) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'json-schema',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleJsonSchemaDef,
      });

      expect(result.data).toEqual(responseData);
      expect(result.confidence).toHaveLength(3);
    });

    it('extracts data with custom adapter', async () => {
      const customAdapter: FormAdapter = {
        name: 'simple',
        toPrompt: () => 'Extract the "value" field',
        toOutputSchema: () => z.object({ value: z.string() }),
      };
      const provider = createMockProvider([{ content: JSON.stringify({ value: 'hello' }) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'custom',
        customAdapter,
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: {},
      });

      expect(result.data).toEqual({ value: 'hello' });
    });

    it('normalizes multipletext title keys to item name keys', async () => {
      const provider = createMockProvider([
        {
          content: JSON.stringify({
            contacts: {
              'Phone Number': '123-456-7890',
              'Fax Number': '555-1234',
            },
          }),
        },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: multipleTextSurveyDef,
      });

      expect(result.data).toEqual({
        contacts: {
          phone: '123-456-7890',
          fax: '555-1234',
        },
      });
    });

    it('normalizes question title keys and multipletext item title keys to names', async () => {
      const provider = createMockProvider([
        {
          content: JSON.stringify({
            'First Name': 'John',
            'Contact Information': {
              'Phone Number': '123-456-7890',
              'Fax Number': '555-1234',
            },
          }),
        },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: titleMappedSurveyDef,
      });

      expect(result.data).toEqual({
        firstName: 'John',
        contacts: {
          phone: '123-456-7890',
          fax: '555-1234',
        },
      });
    });
  });

  describe('retry logic', () => {
    it('strips markdown code fences from LLM response before parsing', async () => {
      const responseData = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
      const fencedContent = '```json\n' + JSON.stringify(responseData) + '\n```';
      const provider = createMockProvider([{ content: fencedContent }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data).toEqual(responseData);
      expect(provider.extractFromImage).toHaveBeenCalledTimes(1);
    });

    it('strips markdown code fences without language tag', async () => {
      const responseData = { firstName: 'Jane', lastName: 'Smith', age: 25 };
      const fencedContent = '```\n' + JSON.stringify(responseData) + '\n```';
      const provider = createMockProvider([{ content: fencedContent }]);

      const extractor = createExtractor({
        provider,
        adapter: 'json-schema',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleJsonSchemaDef,
      });

      expect(result.data).toEqual(responseData);
    });

    it('extracts JSON from response with preamble text and fences', async () => {
      const responseData = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
      const responseWithPreamble =
        "Here is the extracted data:\n\n```json\n" +
        JSON.stringify(responseData) +
        "\n```\n\nLet me know if you need anything else.";
      const provider = createMockProvider([{ content: responseWithPreamble }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data).toEqual(responseData);
      expect(provider.extractFromImage).toHaveBeenCalledTimes(1);
    });

    it('extracts bare JSON after preamble text (no fences)', async () => {
      const responseData = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
      const responseWithPreamble =
        "Based on my analysis:\n" + JSON.stringify(responseData);
      const provider = createMockProvider([{ content: responseWithPreamble }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data).toEqual(responseData);
      expect(provider.extractFromImage).toHaveBeenCalledTimes(1);
    });

    it('retries on invalid JSON and succeeds', async () => {
      const validResponse = { firstName: 'John', lastName: 'Doe', email: null };
      const provider = createMockProvider([
        { content: 'This is not JSON at all' },
        { content: JSON.stringify(validResponse) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, maxRetries: 2 },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data).toEqual(validResponse);
      expect(provider.extractFromImage).toHaveBeenCalledTimes(2);

      // Second call should include error feedback in prompt
      const secondCall = (provider.extractFromImage as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(secondCall.prompt).toContain('Your previous response was invalid');
    });

    it('retries on Zod validation failure and succeeds', async () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 123, lastName: 456 }) }, // numbers, not strings
        { content: JSON.stringify({ firstName: 'John', lastName: 'Doe' }) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, maxRetries: 2 },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data.firstName).toBe('John');
      expect(provider.extractFromImage).toHaveBeenCalledTimes(2);
    });

    it('throws after all retries exhausted', async () => {
      const provider = createMockProvider([
        { content: 'not json' },
        { content: 'still not json' },
        { content: 'nope' },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, maxRetries: 2 },
      });

      await expect(
        extractor.extractFromImage({
          image: TINY_PNG,
          formDefinition: simpleSurveyDef,
        })
      ).rejects.toThrow('Extraction failed after 3 attempts');
    });

    it('respects maxRetries=0 (no retries)', async () => {
      const provider = createMockProvider([{ content: 'bad' }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, maxRetries: 0 },
      });

      await expect(
        extractor.extractFromImage({
          image: TINY_PNG,
          formDefinition: simpleSurveyDef,
        })
      ).rejects.toThrow('Extraction failed after 1 attempts');
      expect(provider.extractFromImage).toHaveBeenCalledTimes(1);
    });

    it('detects truncated response and retries with concise prompt', async () => {
      const validResponse = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
      const provider = createMockProvider([
        { content: '{"firstName": "John", "lastName": "Doe', truncated: true },
        { content: JSON.stringify(validResponse) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, maxRetries: 2 },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data).toEqual(validResponse);
      expect(provider.extractFromImage).toHaveBeenCalledTimes(2);

      // Second call should include truncation-specific guidance
      const secondCall = (provider.extractFromImage as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(secondCall.prompt).toContain('previous response was cut off');
      expect(secondCall.prompt).toContain('ONLY the JSON object');
    });

    it('fails after all retries when response is always truncated', async () => {
      const provider = createMockProvider([
        { content: '{"firstName": "Jo', truncated: true },
        { content: '{"firstName": "Jo', truncated: true },
        { content: '{"firstName": "Jo', truncated: true },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, maxRetries: 2 },
      });

      await expect(
        extractor.extractFromImage({
          image: TINY_PNG,
          formDefinition: simpleSurveyDef,
        })
      ).rejects.toThrow('Extraction failed after 3 attempts');
    });
  });

  describe('confidence scoring', () => {
    it('assigns 1.0 to present fields and 0.0 to null fields', async () => {
      const responseData = { firstName: 'John', lastName: 'Doe', email: null };
      const provider = createMockProvider([{ content: JSON.stringify(responseData) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      const firstNameConf = result.confidence.find(c => c.fieldName === 'firstName');
      expect(firstNameConf?.confidence).toBe(1.0);
      expect(firstNameConf?.flagged).toBe(false);

      const lastNameConf = result.confidence.find(c => c.fieldName === 'lastName');
      expect(lastNameConf?.confidence).toBe(1.0);
      expect(lastNameConf?.flagged).toBe(false);

      const emailConf = result.confidence.find(c => c.fieldName === 'email');
      expect(emailConf?.confidence).toBe(0.0);
      expect(emailConf?.flagged).toBe(true);
    });

    it('uses _confidence from LLM when provided', async () => {
      const responseData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        _confidence: { firstName: 0.95, lastName: 0.6, email: 0.8 },
      };
      const provider = createMockProvider([{ content: JSON.stringify(responseData) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, confidenceThreshold: 0.75 },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.data._confidence).toBeUndefined();

      const firstNameConf = result.confidence.find(c => c.fieldName === 'firstName');
      expect(firstNameConf?.confidence).toBe(0.95);
      expect(firstNameConf?.flagged).toBe(false);

      const lastNameConf = result.confidence.find(c => c.fieldName === 'lastName');
      expect(lastNameConf?.confidence).toBe(0.6);
      expect(lastNameConf?.flagged).toBe(true);

      const emailConf = result.confidence.find(c => c.fieldName === 'email');
      expect(emailConf?.confidence).toBe(0.8);
      expect(emailConf?.flagged).toBe(false);
    });

    it('flags fields below custom confidence threshold', async () => {
      const responseData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@test.com',
        _confidence: { firstName: 0.5, lastName: 0.5, email: 0.5 },
      };
      const provider = createMockProvider([{ content: JSON.stringify(responseData) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, confidenceThreshold: 0.9 },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.confidence.every(c => c.flagged)).toBe(true);
    });

    it('includes omitted optional fields in data and confidence with null/0.0', async () => {
      // LLM returns only required fields, omitting optional "email"
      const responseData = { firstName: 'John', lastName: 'Doe' };
      const provider = createMockProvider([{ content: JSON.stringify(responseData) }]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      // All 3 schema fields should be present in confidence
      expect(result.confidence).toHaveLength(3);

      // Omitted optional field should appear as null in data
      expect(result.data.email).toBeNull();

      const emailConf = result.confidence.find(c => c.fieldName === 'email');
      expect(emailConf?.confidence).toBe(0.0);
      expect(emailConf?.flagged).toBe(true);
      expect(emailConf?.value).toBeNull();
    });
  });

  describe('unique ID detection', () => {
    it('falls back to hint when detection returns null', async () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'A', lastName: 'B' }) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
        uniqueIdHint: 'FORM-12345',
      });

      expect(result.uniqueId).toBe('FORM-12345');
    });

    it('returns null uniqueId when no detection and no hint', async () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'A', lastName: 'B' }) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.uniqueId).toBeNull();
    });
  });

  describe('cost tracking', () => {
    it('includes usage when logCosts is true', async () => {
      const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'A', lastName: 'B' }), usage },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, logCosts: true },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.usage).toEqual(usage);
    });

    it('omits usage when logCosts is false', async () => {
      const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'A', lastName: 'B' }), usage },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, logCosts: false },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.usage).toBeUndefined();
    });

    it('omits usage when logCosts true but provider returns no usage', async () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'A', lastName: 'B' }) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false, logCosts: true },
      });

      const result = await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      expect(result.usage).toBeUndefined();
    });
  });

  describe('system prompt', () => {
    it('sends correct system prompt to provider', async () => {
      const provider = createMockProvider([
        { content: JSON.stringify({ firstName: 'A', lastName: 'B' }) },
      ]);

      const extractor = createExtractor({
        provider,
        adapter: 'surveyjs',
        options: { preprocessImage: false },
      });

      await extractor.extractFromImage({
        image: TINY_PNG,
        formDefinition: simpleSurveyDef,
      });

      const call = (provider.extractFromImage as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('document data extraction assistant');
      expect(call.systemPrompt).toContain('Return valid JSON only');
      expect(call.systemPrompt).toContain('_confidence');
    });
  });
});
