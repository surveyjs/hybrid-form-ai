import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { JsonSchemaAdapter } from '../json-schema';

const adapter = new JsonSchemaAdapter();

const sampleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    age: { type: 'integer', description: 'Age in years' },
    email: { type: 'string', description: 'Email address' },
    active: { type: 'boolean', description: 'Is the account active' },
    role: { type: 'string', enum: ['admin', 'user', 'guest'] },
    tags: { type: 'array', items: { type: 'string' } },
    address: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        zip: { type: 'string' },
      },
      required: ['street'],
    },
  },
  required: ['name', 'age'],
};

// ─── toPrompt tests ─────────────────────────────────────────────

describe('JsonSchemaAdapter.toPrompt', () => {
  it('lists all properties with types and descriptions', () => {
    const prompt = adapter.toPrompt(sampleSchema);
    expect(prompt).toContain('"name"');
    expect(prompt).toContain('string');
    expect(prompt).toContain('Full name of the person');
    expect(prompt).toContain('"age"');
    expect(prompt).toContain('integer');
    expect(prompt).toContain('"email"');
    expect(prompt).toContain('"active"');
    expect(prompt).toContain('boolean');
    expect(prompt).toContain('"role"');
    expect(prompt).toContain('admin, user, guest');
    expect(prompt).toContain('"tags"');
    expect(prompt).toContain('array');
  });

  it('marks required and optional fields', () => {
    const prompt = adapter.toPrompt(sampleSchema);
    // name and age are required
    expect(prompt).toContain('"name" (required)');
    expect(prompt).toContain('"age" (required)');
    // email is optional
    expect(prompt).toContain('"email" (optional)');
  });

  it('returns empty string for empty schema', () => {
    expect(adapter.toPrompt({})).toBe('');
    expect(adapter.toPrompt({ type: 'object', properties: {} })).toBe('');
  });
});

// ─── toOutputSchema tests ───────────────────────────────────────

describe('JsonSchemaAdapter.toOutputSchema', () => {
  it('validates correct data', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    const valid = {
      name: 'Alice',
      age: 30,
      email: 'alice@example.com',
      active: true,
      role: 'admin',
      tags: ['dev', 'ops'],
      address: { street: '123 Main St', zip: '12345' },
    };
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('accepts data with only required fields', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    expect(schema.safeParse({ name: 'Bob', age: 25 }).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    expect(schema.safeParse({ name: 'Bob' }).success).toBe(false);
    expect(schema.safeParse({ age: 25 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid types', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    // age should be number
    expect(schema.safeParse({ name: 'X', age: 'thirty' }).success).toBe(false);
    // name should be string
    expect(schema.safeParse({ name: 123, age: 30 }).success).toBe(false);
  });

  it('validates enum values', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    expect(schema.safeParse({ name: 'X', age: 1, role: 'admin' }).success).toBe(true);
    expect(schema.safeParse({ name: 'X', age: 1, role: 'superadmin' }).success).toBe(false);
  });

  it('validates array items', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    expect(schema.safeParse({ name: 'X', age: 1, tags: ['a', 'b'] }).success).toBe(true);
    expect(schema.safeParse({ name: 'X', age: 1, tags: [1, 2] }).success).toBe(false);
  });

  it('validates nested objects', () => {
    const schema = adapter.toOutputSchema(sampleSchema);
    // valid nested
    expect(schema.safeParse({ name: 'X', age: 1, address: { street: 'A' } }).success).toBe(true);
    // missing required nested field
    expect(schema.safeParse({ name: 'X', age: 1, address: { zip: '123' } }).success).toBe(false);
  });

  it('maps all basic JSON Schema types', () => {
    const basicSchema = {
      type: 'object',
      properties: {
        s: { type: 'string' },
        n: { type: 'number' },
        i: { type: 'integer' },
        b: { type: 'boolean' },
      },
      required: ['s', 'n', 'i', 'b'],
    };
    const schema = adapter.toOutputSchema(basicSchema);
    expect(schema.safeParse({ s: 'hi', n: 1.5, i: 3, b: true }).success).toBe(true);
    expect(schema.safeParse({ s: 1, n: 'x', i: 'y', b: 'z' }).success).toBe(false);
    // integer rejects non-integers
    expect(schema.safeParse({ s: 'hi', n: 1.5, i: 3.5, b: true }).success).toBe(false);
  });

  it('handles numeric enums without stringifying', () => {
    const numEnumSchema = {
      type: 'object',
      properties: {
        level: { type: 'integer', enum: [1, 2, 3] },
      },
      required: ['level'],
    };
    const schema = adapter.toOutputSchema(numEnumSchema);
    expect(schema.safeParse({ level: 1 }).success).toBe(true);
    expect(schema.safeParse({ level: 2 }).success).toBe(true);
    // rejects string version of the number
    expect(schema.safeParse({ level: '1' }).success).toBe(false);
    // rejects value not in enum
    expect(schema.safeParse({ level: 4 }).success).toBe(false);
  });

  it('handles schema with no required array', () => {
    const noReq = {
      type: 'object',
      properties: {
        x: { type: 'string' },
      },
    };
    const schema = adapter.toOutputSchema(noReq);
    // All optional — empty object is valid
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ x: 'hello' }).success).toBe(true);
  });

  it('returns empty object schema for empty properties', () => {
    const schema = adapter.toOutputSchema({}) as z.ZodObject<Record<string, z.ZodTypeAny>>;
    expect(schema.safeParse({}).success).toBe(true);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });
});
