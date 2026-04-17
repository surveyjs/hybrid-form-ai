import { describe, it, expect } from 'vitest';
import { extractJsonFromResponse } from '../extractor';

describe('extractJsonFromResponse', () => {
  describe('clean JSON (no fences or preamble)', () => {
    it('returns clean JSON object as-is', () => {
      const json = '{"name": "John", "age": 30}';
      expect(extractJsonFromResponse(json)).toBe(json);
    });

    it('returns clean JSON array as-is', () => {
      const json = '[1, 2, 3]';
      expect(extractJsonFromResponse(json)).toBe(json);
    });

    it('trims whitespace', () => {
      const json = '  {"name": "John"}  ';
      expect(extractJsonFromResponse(json)).toBe('{"name": "John"}');
    });
  });

  describe('markdown code fences at start/end only', () => {
    it('strips ```json ... ``` fences', () => {
      const input = '```json\n{"name": "John"}\n```';
      expect(extractJsonFromResponse(input)).toBe('{"name": "John"}');
    });

    it('strips ``` ... ``` fences without language tag', () => {
      const input = '```\n{"name": "John"}\n```';
      expect(extractJsonFromResponse(input)).toBe('{"name": "John"}');
    });

    it('strips fences with extra whitespace', () => {
      const input = '```json  \n  {"name": "John"}  \n```';
      expect(extractJsonFromResponse(input)).toBe('{"name": "John"}');
    });
  });

  describe('preamble text before fenced JSON', () => {
    it('extracts JSON from fences with preamble text', () => {
      const input = 'Here is the extracted data:\n```json\n{"name": "John", "age": 30}\n```';
      expect(extractJsonFromResponse(input)).toBe('{"name": "John", "age": 30}');
    });

    it('extracts JSON from fences with multi-line preamble', () => {
      const input =
        "I've analyzed the document and extracted the following fields:\n\n" +
        '```json\n{"firstName": "Jane", "lastName": "Smith"}\n```';
      expect(extractJsonFromResponse(input)).toBe('{"firstName": "Jane", "lastName": "Smith"}');
    });

    it('extracts JSON from fences with preamble and postamble', () => {
      const input =
        'Here is the result:\n```json\n{"name": "John"}\n```\nLet me know if you need anything else.';
      expect(extractJsonFromResponse(input)).toBe('{"name": "John"}');
    });
  });

  describe('preamble text without fences (bare JSON object)', () => {
    it('extracts JSON object after preamble text', () => {
      const input = 'Here is the extracted data:\n{"name": "John", "age": 30}';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual({ name: 'John', age: 30 });
    });

    it('extracts JSON object with postamble text', () => {
      const input = '{"name": "John"}\nI hope this helps!';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual({ name: 'John' });
    });

    it('extracts JSON object surrounded by text', () => {
      const input = 'Result:\n{"name": "John", "age": 30}\nDone.';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('nested JSON objects', () => {
    it('extracts deeply nested JSON correctly', () => {
      const data = {
        patient: 'John',
        details: {
          surgery: { type: 'mastectomy', date: '2024-01-15' },
          findings: { receptor: 'positive' },
        },
      };
      const input = 'Extracted:\n```json\n' + JSON.stringify(data, null, 2) + '\n```';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });

    it('handles nested objects without fences', () => {
      const data = {
        name: 'John',
        address: { city: 'NYC', zip: '10001' },
      };
      const input = 'Here is the data:\n' + JSON.stringify(data);
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });
  });

  describe('JSON with strings containing special characters', () => {
    it('handles JSON with curly braces inside strings', () => {
      const data = { template: 'Hello {name}', value: 'test' };
      const json = JSON.stringify(data);
      const input = 'Result:\n' + json;
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });

    it('handles JSON with escaped quotes inside strings', () => {
      const data = { note: 'He said "hello"', name: 'John' };
      const json = JSON.stringify(data);
      const input = 'Here:\n' + json;
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });

    it('handles JSON with backslashes inside strings', () => {
      const data = { path: 'C:\\Users\\test', name: 'John' };
      const json = JSON.stringify(data);
      const input = 'Data:\n' + json;
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });

    it('handles JSON with markdown-like content in strings', () => {
      const data = { note: 'Use ```code``` blocks', name: 'John' };
      const input = '```json\n' + JSON.stringify(data) + '\n```';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });
  });

  describe('_confidence object (real-world extraction pattern)', () => {
    it('preserves _confidence in extracted JSON', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        _confidence: { firstName: 0.95, lastName: 0.8 },
      };
      const input =
        "Here's what I extracted from the form:\n\n```json\n" +
        JSON.stringify(data, null, 2) +
        '\n```\n\nThe confidence scores reflect the clarity of the handwriting.';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });
  });

  describe('multi-line pretty-printed JSON', () => {
    it('handles pretty-printed JSON in fences', () => {
      const data = { a: 1, b: 'hello', c: [1, 2, 3] };
      const pretty = JSON.stringify(data, null, 2);
      const input = '```json\n' + pretty + '\n```';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });

    it('handles pretty-printed JSON without fences after preamble', () => {
      const data = { a: 1, b: 'hello' };
      const pretty = JSON.stringify(data, null, 2);
      const input = 'Extracted data:\n' + pretty + '\n\nDone.';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual(data);
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(extractJsonFromResponse('')).toBe('');
    });

    it('returns non-JSON text as-is when no JSON found', () => {
      const input = 'I could not extract any data from this image.';
      expect(extractJsonFromResponse(input)).toBe(input);
    });

    it('handles JSON array in fences', () => {
      const input = '```json\n[1, 2, 3]\n```';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual([1, 2, 3]);
    });

    it('handles JSON array without fences after preamble', () => {
      const input = 'Results: [{"name": "John"}, {"name": "Jane"}]';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual([
        { name: 'John' },
        { name: 'Jane' },
      ]);
    });

    it('prefers fenced JSON over bare JSON in text', () => {
      // If there's both preamble with a { and a fenced block, prefer the fenced block
      const input = 'Config {old}: \n```json\n{"new": true}\n```';
      expect(JSON.parse(extractJsonFromResponse(input))).toEqual({ new: true });
    });
  });

  describe('real-world Anthropic response patterns', () => {
    it('handles typical Claude response with explanation before JSON', () => {
      const input =
        "Based on my analysis of the scanned form image, here are the extracted field values:\n\n" +
        "```json\n" +
        '{\n' +
        '  "patient": "Peyton, Olivia",\n' +
        '  "MRN": "123456",\n' +
        '  "sex": "Female",\n' +
        '  "birthdate": "1981-06-03",\n' +
        '  "synoptic-operative-report": {\n' +
        '    "Surgeon:": "Dr. John Smith"\n' +
        '  },\n' +
        '  "_confidence": {\n' +
        '    "patient": 0.95,\n' +
        '    "MRN": 0.9,\n' +
        '    "sex": 0.99,\n' +
        '    "birthdate": 0.85\n' +
        '  }\n' +
        '}\n' +
        '```\n\n' +
        'Note: Some fields had low visibility due to image quality.';

      const parsed = JSON.parse(extractJsonFromResponse(input));
      expect(parsed.patient).toBe('Peyton, Olivia');
      expect(parsed.MRN).toBe('123456');
      expect(parsed._confidence.patient).toBe(0.95);
    });

    it('handles Claude response with just preamble and bare JSON (no fences)', () => {
      const input =
        "Here is the extracted data:\n\n" +
        '{"patient": "Peyton, Olivia", "MRN": "123456", "sex": "Female"}';

      const parsed = JSON.parse(extractJsonFromResponse(input));
      expect(parsed.patient).toBe('Peyton, Olivia');
      expect(parsed.sex).toBe('Female');
    });
  });
});
