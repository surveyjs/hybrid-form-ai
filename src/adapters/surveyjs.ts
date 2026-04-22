import { z } from 'zod';
import type { FormAdapter } from './base';

const SKIP_TYPES = new Set(['signature', 'html', 'image', 'file']);

interface SurveyChoice {
  value: string | number;
  text?: string;
}

interface SurveyColumn {
  value?: string | number;
  name?: string;
  title?: string;
  text?: string;
  cellType?: string;
}

interface SurveyRow {
  value: string | number;
  text?: string;
}

interface SurveyElement {
  type: string;
  name: string;
  title?: string;
  isRequired?: boolean;
  inputType?: string;
  choices?: Array<string | SurveyChoice>;
  columns?: Array<string | SurveyColumn>;
  rows?: Array<string | SurveyRow>;
  items?: Array<{ name: string; title?: string }>;
  rateMin?: number;
  rateMax?: number;
  rateCount?: number;
  min?: number;
  max?: number;
  step?: number;
  elements?: SurveyElement[];
  templateElements?: SurveyElement[];
  multiSelect?: boolean;
  validators?: Array<Record<string, unknown>>;
}

interface SurveyPage {
  name?: string;
  elements?: SurveyElement[];
}

function normalizeNameTitleKey(key: string): string {
  return key.trim().replace(/\s+/g, ' ').toLowerCase();
}

function createNameTitleMap(entries: Array<{ name: string; title?: string }>): Map<string, string> {
  const keyMap = new Map<string, string>();
  for (const entry of entries) {
    keyMap.set(entry.name, entry.name);
    keyMap.set(normalizeNameTitleKey(entry.name), entry.name);
    if (entry.title) {
      keyMap.set(entry.title, entry.name);
      keyMap.set(normalizeNameTitleKey(entry.title), entry.name);
    }
  }
  return keyMap;
}

function mapNameTitleScalar(
  value: unknown,
  entries?: Array<{ name: string; title?: string }>,
): unknown {
  if ((typeof value !== 'string' && typeof value !== 'number') || !entries || entries.length === 0) {
    return value;
  }

  const keyMap = createNameTitleMap(entries);
  const raw = String(value);
  return keyMap.get(raw) ?? keyMap.get(normalizeNameTitleKey(raw)) ?? value;
}

function mapNameTitleArray(
  value: unknown,
  entries?: Array<{ name: string; title?: string }>,
): unknown {
  if (!Array.isArray(value) || !entries || entries.length === 0) {
    return value;
  }
  return value.map((item) => mapNameTitleScalar(item, entries));
}

function itemValueEntries(
  values?: Array<string | SurveyChoice | SurveyRow>,
): Array<{ name: string; title?: string }> {
  if (!values) return [];
  return values.map((value) => {
    if (typeof value === 'string') return { name: value };
    return { name: String(value.value), title: value.text };
  });
}

function columnEntries(columns?: Array<string | SurveyColumn>): Array<{ name: string; title?: string }> {
  if (!columns) return [];
  return columns
    .filter((col): col is SurveyColumn => typeof col !== 'string')
    .map((col) => {
      const columnName = col.name ?? String(col.value ?? '');
      const columnTitle = col.title ?? col.text;
      return { name: columnName, title: columnTitle };
    })
    .filter((entry) => entry.name.length > 0);
}

function mapNameTitleKeys(
  value: unknown,
  entries?: Array<{ name: string; title?: string }>,
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !entries || entries.length === 0) {
    return value;
  }

  const keyMap = createNameTitleMap(entries);

  const input = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const mapped = keyMap.get(rawKey) ?? keyMap.get(normalizeNameTitleKey(rawKey));
    if (mapped) {
      // Prefer explicit name keys when both name and title variants are present.
      if (!(mapped in normalized) || rawKey === mapped) {
        normalized[mapped] = rawValue;
      }
    } else {
      normalized[rawKey] = rawValue;
    }
  }

  return normalized;
}

function normalizeSurveyResponseByNameTitle(
  value: unknown,
  elements: SurveyElement[],
): unknown {
  const rootMapped = mapNameTitleKeys(
    value,
    elements.map((el) => ({ name: el.name, title: el.title })),
  );

  if (!rootMapped || typeof rootMapped !== 'object' || Array.isArray(rootMapped)) {
    return rootMapped;
  }

  const normalizedRoot = { ...(rootMapped as Record<string, unknown>) };

  for (const el of elements) {
    const choiceEntries = itemValueEntries(el.choices);
    if (choiceEntries.length > 0) {
      if (el.type === 'radiogroup' || el.type === 'dropdown' || (el.type === 'imagepicker' && !el.multiSelect)) {
        normalizedRoot[el.name] = mapNameTitleScalar(normalizedRoot[el.name], choiceEntries);
      }
      if (el.type === 'checkbox' || el.type === 'tagbox' || el.type === 'ranking' || (el.type === 'imagepicker' && el.multiSelect)) {
        normalizedRoot[el.name] = mapNameTitleArray(normalizedRoot[el.name], choiceEntries);
      }
    }

    if (el.type !== 'multipletext' || !el.items || el.items.length === 0) {
      // Fall through to matrix normalization checks.
    } else {
      const current = normalizedRoot[el.name];
      normalizedRoot[el.name] = mapNameTitleKeys(current, el.items);
    }

    const rowEntries = itemValueEntries(el.rows);
    const matrixColumnEntries = columnEntries(el.columns);

    if (el.type === 'matrix') {
      const matrixValue = normalizedRoot[el.name];
      if (matrixValue && typeof matrixValue === 'object' && !Array.isArray(matrixValue)) {
        const mappedRows = mapNameTitleKeys(matrixValue, rowEntries) as Record<string, unknown>;
        const mappedValues: Record<string, unknown> = {};
        for (const [rowKey, rowValue] of Object.entries(mappedRows)) {
          mappedValues[rowKey] = matrixColumnEntries.length > 0
            ? mapNameTitleScalar(rowValue, matrixColumnEntries)
            : rowValue;
        }
        normalizedRoot[el.name] = mappedValues;
      }
    }

    if ((el.type === 'matrixdynamic' || el.type === 'matrixdropdown') && el.columns && el.columns.length > 0) {
      if (matrixColumnEntries.length > 0) {
        const matrixValue = normalizedRoot[el.name];
        if (el.type === 'matrixdynamic' && Array.isArray(matrixValue)) {
          normalizedRoot[el.name] = matrixValue.map((row) => mapNameTitleKeys(row, matrixColumnEntries));
        }

        if (el.type === 'matrixdropdown' && matrixValue && typeof matrixValue === 'object' && !Array.isArray(matrixValue)) {
          const rows = mapNameTitleKeys(matrixValue, rowEntries) as Record<string, unknown>;
          const mappedRows: Record<string, unknown> = {};
          for (const [rowKey, rowValue] of Object.entries(rows)) {
            mappedRows[rowKey] = mapNameTitleKeys(rowValue, matrixColumnEntries);
          }
          normalizedRoot[el.name] = mappedRows;
        }
      }
    }
  }

  return normalizedRoot;
}

function choiceLabels(choices?: Array<string | SurveyChoice>): string[] {
  if (!choices) return [];
  return choices.map(c => {
    if (typeof c === 'string') return c;
    if (c.text && c.text !== String(c.value)) return `${c.value} (${c.text})`;
    return String(c.value);
  });
}

function choiceValues(choices?: Array<string | SurveyChoice>): string[] {
  if (!choices) return [];
  return choices.map(c => (typeof c === 'string' ? c : String(c.value)));
}

function rowLabels(rows?: Array<string | SurveyRow>): string[] {
  if (!rows) return [];
  return rows.map(r => {
    if (typeof r === 'string') return r;
    if (r.text && r.text !== String(r.value)) return `${r.value} (${r.text})`;
    return String(r.value);
  });
}

function columnLabels(columns?: Array<string | SurveyColumn>): string[] {
  if (!columns) return [];
  return columns.map(c => {
    if (typeof c === 'string') return c;
    const key = c.name ?? String(c.value ?? '');
    if (c.text && c.text !== key) return `${key} (${c.text})`;
    return key;
  });
}

function collectElements(pages?: SurveyPage[]): SurveyElement[] {
  if (!pages) return [];
  const result: SurveyElement[] = [];
  for (const page of pages) {
    if (page.elements) result.push(...page.elements);
  }
  return result;
}

function flattenElements(elements: SurveyElement[]): SurveyElement[] {
  const result: SurveyElement[] = [];
  for (const el of elements) {
    if (SKIP_TYPES.has(el.type)) continue;
    if (el.type === 'panel') {
      if (el.elements) result.push(...flattenElements(el.elements));
    } else {
      result.push(el);
    }
  }
  return result;
}

function describeElement(el: SurveyElement, index: number): string {
  const title = el.title ?? el.name;
  const req = el.isRequired ? '(required)' : '(optional)';
  const lines: string[] = [`${index}. "${el.name}" — ${title} ${req}`];

  switch (el.type) {
    case 'text': {
      const it = el.inputType ?? 'text';
      lines.push(`   Type: text (${it})`);
      if (it === 'number') lines.push('   Expected value: a number');
      else if (it === 'email') lines.push('   Expected value: a valid email address');
      else if (it === 'date') lines.push('   Expected value: a date string (YYYY-MM-DD)');
      else lines.push('   Expected value: a string');
      break;
    }
    case 'comment':
      lines.push('   Type: multi-line text', '   Expected value: a string');
      break;
    case 'radiogroup':
      lines.push(
        '   Type: single choice',
        `   Choices: ${choiceLabels(el.choices).join(', ')}`,
        '   Expected value: one of the listed choices',
      );
      break;
    case 'checkbox':
    case 'tagbox':
      lines.push(
        '   Type: multiple choice',
        `   Choices: ${choiceLabels(el.choices).join(', ')}`,
        '   Expected value: an array of selected choices',
      );
      break;
    case 'dropdown':
      lines.push(
        '   Type: dropdown (single choice)',
        `   Choices: ${choiceLabels(el.choices).join(', ')}`,
        '   Expected value: one of the listed choices',
      );
      break;
    case 'rating': {
      const min = el.rateMin ?? 1;
      const max = el.rateMax ?? (el.rateCount ?? 5);
      lines.push(`   Type: rating`, `   Range: ${min} to ${max}`, '   Expected value: a number in the rating range');
      break;
    }
    case 'boolean':
      lines.push('   Type: boolean (true/false)', '   Expected value: true or false');
      break;
    case 'signaturepad':
      lines.push(
        '   Type: signature pad',
        '   Expected value: a base64-encoded image string of the captured signature',
      );
      break;
    case 'matrix': {
      const r = rowLabels(el.rows);
      const c = columnLabels(el.columns);
      lines.push(
        '   Type: matrix (single choice per row)',
        `   Rows: ${r.join(', ')}`,
        `   Columns: ${c.join(', ')}`,
        '   Expected value: an object with row names as keys and selected column as value',
      );
      break;
    }
    case 'matrixdynamic': {
      const c = columnLabels(el.columns);
      lines.push(
        '   Type: dynamic matrix (table with rows)',
        `   Columns: ${c.join(', ')}`,
        '   Expected value: an array of objects, each with column names as keys',
      );
      break;
    }
    case 'matrixdropdown': {
      const r = rowLabels(el.rows);
      const c = columnLabels(el.columns);
      lines.push(
        '   Type: matrix dropdown',
        `   Rows: ${r.join(', ')}`,
        `   Columns: ${c.join(', ')}`,
        '   Expected value: an object with row names as keys, each containing an object with column names as keys',
      );
      break;
    }
    case 'multipletext': {
      const items = (el.items ?? []).map(i => i.title ?? i.name);
      lines.push(
        '   Type: multiple text inputs',
        `   Items: ${items.join(', ')}`,
        '   Expected value: an object with item names as keys and text values',
      );
      break;
    }
    case 'ranking':
      lines.push(
        '   Type: ranking (order by preference)',
        `   Items: ${choiceLabels(el.choices).join(', ')}`,
        '   Expected value: an array of items ordered by preference',
      );
      break;
    case 'imagepicker': {
      const mode = el.multiSelect ? 'multiple' : 'single';
      lines.push(
        `   Type: image picker (${mode} selection)`,
        `   Choices: ${choiceLabels(el.choices).join(', ')}`,
      );
      lines.push(el.multiSelect
        ? '   Expected value: an array of selected choice values'
        : '   Expected value: one of the listed choices');
      break;
    }
    case 'imagemap': {
      const mode = el.multiSelect ? 'multiple' : 'single';
      lines.push(`   Type: image map (${mode} selection)`);
      lines.push(el.multiSelect
        ? '   Expected value: an array of selected region names'
        : '   Expected value: a selected region name');
      break;
    }
    case 'slider': {
      const min = el.min ?? 0;
      const max = el.max ?? 100;
      const step = el.step ?? 1;
      lines.push(`   Type: slider`, `   Range: ${min} to ${max} (step: ${step})`, '   Expected value: a number');
      break;
    }
    case 'paneldynamic': {
      lines.push('   Type: dynamic panel (repeated sections)');
      if (el.templateElements) {
        const names = el.templateElements
          .filter(te => !SKIP_TYPES.has(te.type))
          .map(te => te.title ?? te.name);
        lines.push(`   Fields per entry: ${names.join(', ')}`);
      }
      lines.push('   Expected value: an array of objects, each with the panel field names as keys');
      break;
    }
    default:
      lines.push(`   Type: ${el.type}`, '   Expected value: appropriate value for this field type');
  }

  if (el.validators && el.validators.length > 0) {
    const descs = el.validators.map(v => {
      const vtype = v.type as string | undefined;
      if (vtype === 'numeric') return `numeric (min: ${v.minValue ?? 'none'}, max: ${v.maxValue ?? 'none'})`;
      if (vtype === 'text') return `text length (min: ${v.minLength ?? 'none'}, max: ${v.maxLength ?? 'none'})`;
      if (vtype === 'email') return 'valid email';
      if (vtype === 'regex') return `regex: ${v.regex}`;
      return String(vtype ?? 'unknown');
    });
    lines.push(`   Validators: ${descs.join('; ')}`);
  }

  return lines.join('\n');
}

function elementToZod(el: SurveyElement): z.ZodTypeAny | null {
  switch (el.type) {
    case 'text':
      return el.inputType === 'number' ? z.number() : z.string();
    case 'comment':
      return z.string();
    case 'radiogroup':
    case 'dropdown': {
      const vals = choiceValues(el.choices);
      if (vals.length >= 2) return z.enum(vals as [string, ...string[]]);
      return z.string();
    }
    case 'checkbox':
    case 'tagbox':
      return z.array(z.string());
    case 'rating':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'signaturepad':
      return z.string();
    case 'matrix':
      return z.record(z.string());
    case 'matrixdynamic':
      return z.array(z.record(z.unknown()));
    case 'matrixdropdown':
      return z.record(z.record(z.unknown()));
    case 'multipletext':
      if (!el.items || el.items.length === 0) {
        return z.record(z.string());
      }

      return z.preprocess(
        (value) => mapNameTitleKeys(value, el.items),
        z.object(
          Object.fromEntries(el.items.map((item) => [item.name, z.string().optional()]))
        ).passthrough(),
      );
    case 'ranking':
      return z.array(z.string());
    case 'imagepicker':
      return el.multiSelect ? z.array(z.string()) : z.string();
    case 'imagemap':
      return el.multiSelect ? z.array(z.string()) : z.string();
    case 'slider':
      return z.number();
    case 'paneldynamic':
      return z.array(z.record(z.unknown()));
    default:
      return z.unknown();
  }
}

/**
 * SurveyJS adapter — converts SurveyJS JSON form definitions
 * into descriptive LLM prompts and output schemas.
 */
export class SurveyJSAdapter implements FormAdapter {
  readonly name = 'surveyjs';

  toPrompt(formDefinition: Record<string, unknown>): string {
    const pages = formDefinition.pages as SurveyPage[] | undefined;
    const elements = flattenElements(collectElements(pages));
    if (elements.length === 0) return '';

    const header =
      'Extract the following form fields from the provided image and return a JSON object with the field names as keys.\n\nFields:';
    const descriptions = elements.map((el, i) => describeElement(el, i + 1));
    const footer =
      '\nReturn a JSON object with the exact field names listed above as keys and the extracted values.';

    return [header, ...descriptions, footer].join('\n');
  }

  toOutputSchema(formDefinition: Record<string, unknown>): z.ZodType {
    const pages = formDefinition.pages as SurveyPage[] | undefined;
    const elements = flattenElements(collectElements(pages));

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const el of elements) {
      const zodType = elementToZod(el);
      if (!zodType) continue;
      shape[el.name] = el.isRequired ? zodType : zodType.optional();
    }

    return z.object(shape);
  }

  normalizeResponseData(
    formDefinition: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const pages = formDefinition.pages as SurveyPage[] | undefined;
    const elements = flattenElements(collectElements(pages));
    return normalizeSurveyResponseByNameTitle(data, elements) as Record<string, unknown>;
  }
}
