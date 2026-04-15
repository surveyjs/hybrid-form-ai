import { z } from 'zod';
import type { FormAdapter } from './base';

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: (string | number)[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface JsonSchemaDefinition {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

function describeProperty(name: string, prop: JsonSchemaProperty, required: boolean): string {
  const req = required ? '(required)' : '(optional)';
  const parts: string[] = [`- "${name}" ${req}`];
  if (prop.type) parts.push(`  Type: ${prop.type}`);
  if (prop.description) parts.push(`  Description: ${prop.description}`);
  if (prop.enum) parts.push(`  Allowed values: ${prop.enum.join(', ')}`);
  if (prop.type === 'array' && prop.items?.type) parts.push(`  Items type: ${prop.items.type}`);
  return parts.join('\n');
}

function jsonSchemaTypeToZod(prop: JsonSchemaProperty): z.ZodTypeAny {
  if (prop.enum && prop.enum.length > 0) {
    const literals = prop.enum.map(v => z.literal(v));
    if (literals.length === 1) return literals[0];
    return z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  switch (prop.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array': {
      const itemSchema = prop.items ? jsonSchemaTypeToZod(prop.items) : z.unknown();
      return z.array(itemSchema);
    }
    case 'object': {
      if (prop.properties) {
        const reqSet = new Set(prop.required ?? []);
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, val] of Object.entries(prop.properties)) {
          const fieldSchema = jsonSchemaTypeToZod(val);
          shape[key] = reqSet.has(key) ? fieldSchema : fieldSchema.optional();
        }
        return z.object(shape);
      }
      return z.record(z.unknown());
    }
    default:
      return z.unknown();
  }
}

/**
 * JSON Schema adapter — converts standard JSON Schema form definitions
 * into LLM prompts and output schemas.
 */
export class JsonSchemaAdapter implements FormAdapter {
  readonly name = 'json-schema';

  toPrompt(formDefinition: Record<string, unknown>): string {
    const schema = formDefinition as unknown as JsonSchemaDefinition;
    const properties = schema.properties;
    if (!properties || Object.keys(properties).length === 0) return '';

    const requiredSet = new Set(schema.required ?? []);
    const header =
      'Extract the following fields from the provided input and return a JSON object with these keys.\n\nFields:';
    const descriptions = Object.entries(properties).map(([name, prop]) =>
      describeProperty(name, prop, requiredSet.has(name)),
    );
    const footer = '\nReturn a JSON object with the exact field names listed above as keys and the extracted values.';

    return [header, ...descriptions, footer].join('\n');
  }

  toOutputSchema(formDefinition: Record<string, unknown>): z.ZodType {
    const schema = formDefinition as unknown as JsonSchemaDefinition;
    const properties = schema.properties ?? {};
    const requiredSet = new Set(schema.required ?? []);

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [name, prop] of Object.entries(properties)) {
      const zodType = jsonSchemaTypeToZod(prop);
      shape[name] = requiredSet.has(name) ? zodType : zodType.optional();
    }
    return z.object(shape);
  }
}
