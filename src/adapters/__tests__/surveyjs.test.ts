import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SurveyJSAdapter } from '../surveyjs';

const adapter = new SurveyJSAdapter();

// ─── Sample forms ───────────────────────────────────────────────

const simpleForm = {
  pages: [
    {
      name: 'page1',
      elements: [
        { type: 'text', name: 'firstName', title: 'First Name', isRequired: true },
        {
          type: 'radiogroup',
          name: 'gender',
          title: 'Gender',
          isRequired: true,
          choices: ['Male', 'Female', 'Other'],
        },
        { type: 'comment', name: 'bio', title: 'Tell us about yourself' },
      ],
    },
  ],
};

const complexForm = {
  pages: [
    {
      name: 'page1',
      elements: [
        {
          type: 'matrix',
          name: 'quality',
          title: 'Quality Assessment',
          isRequired: true,
          rows: [
            { value: 'speed', text: 'Speed' },
            { value: 'reliability', text: 'Reliability' },
          ],
          columns: [
            { value: 'poor', text: 'Poor' },
            { value: 'good', text: 'Good' },
            { value: 'excellent', text: 'Excellent' },
          ],
        },
        { type: 'rating', name: 'overall', title: 'Overall Rating', isRequired: true, rateMin: 1, rateMax: 10 },
        {
          type: 'checkbox',
          name: 'features',
          title: 'Desired Features',
          choices: ['Speed', 'Security', 'Ease of use', 'Price'],
        },
        {
          type: 'dropdown',
          name: 'experience',
          title: 'Experience Level',
          isRequired: true,
          choices: ['Beginner', 'Intermediate', 'Advanced'],
        },
      ],
    },
  ],
};

const nestedForm = {
  pages: [
    {
      name: 'page1',
      elements: [
        { type: 'text', name: 'fullName', title: 'Full Name', isRequired: true },
        {
          type: 'panel',
          name: 'addressPanel',
          elements: [
            { type: 'text', name: 'street', title: 'Street Address', isRequired: true },
            { type: 'text', name: 'city', title: 'City', isRequired: true },
            { type: 'text', name: 'zip', title: 'ZIP Code' },
          ],
        },
        { type: 'boolean', name: 'agree', title: 'Do you agree?', isRequired: true },
      ],
    },
  ],
};

// ─── toPrompt tests ─────────────────────────────────────────────

describe('SurveyJSAdapter.toPrompt', () => {
  it('generates prompt for simple form with all field names', () => {
    const prompt = adapter.toPrompt(simpleForm);
    expect(prompt).toContain('"firstName"');
    expect(prompt).toContain('"gender"');
    expect(prompt).toContain('"bio"');
    expect(prompt).toContain('First Name');
    expect(prompt).toContain('(required)');
    expect(prompt).toContain('(optional)');
    expect(prompt).toContain('Male, Female, Other');
    expect(prompt).toContain('single choice');
    expect(prompt).toContain('multi-line text');
  });

  it('shows choice text in prompt for radiogroup with {value, text} choices', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [{
          type: 'radiogroup',
          name: 'color',
          title: 'Favorite Color',
          choices: [
            { value: 'red', text: 'Red Color' },
            { value: 'green', text: 'Green Color' },
            { value: 'blue', text: 'Blue Color' },
          ],
        }],
      }],
    };
    const prompt = adapter.toPrompt(form);
    expect(prompt).toContain('red (Red Color), green (Green Color), blue (Blue Color)');
  });

  it('shows choice text in prompt for checkbox with {value, text} choices', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [{
          type: 'checkbox',
          name: 'colors',
          title: 'Select Colors',
          choices: [
            { value: 'red', text: 'Red Color' },
            { value: 'green', text: 'Green Color' },
          ],
        }],
      }],
    };
    const prompt = adapter.toPrompt(form);
    expect(prompt).toContain('red (Red Color), green (Green Color)');
  });

  it('generates prompt for complex form with matrix, rating, checkbox, dropdown', () => {
    const prompt = adapter.toPrompt(complexForm);
    expect(prompt).toContain('"quality"');
    expect(prompt).toContain('matrix');
    expect(prompt).toContain('speed (Speed), reliability (Reliability)');
    expect(prompt).toContain('poor (Poor), good (Good), excellent (Excellent)');
    expect(prompt).toContain('"overall"');
    expect(prompt).toContain('rating');
    expect(prompt).toContain('1 to 10');
    expect(prompt).toContain('"features"');
    expect(prompt).toContain('multiple choice');
    expect(prompt).toContain('"experience"');
    expect(prompt).toContain('dropdown');
    expect(prompt).toContain('Beginner, Intermediate, Advanced');
  });

  it('generates prompt for tagbox (multi-select dropdown)', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'tagbox', name: 'colors', title: 'Favorite Colors', choices: ['Red', 'Green', 'Blue'] },
        ],
      }],
    };
    const prompt = adapter.toPrompt(form);
    expect(prompt).toContain('"colors"');
    expect(prompt).toContain('multiple choice');
    expect(prompt).toContain('Red, Green, Blue');
    expect(prompt).toContain('an array of selected choices');
  });

  it('recurses into panels for nested form', () => {
    const prompt = adapter.toPrompt(nestedForm);
    expect(prompt).toContain('"fullName"');
    expect(prompt).toContain('"street"');
    expect(prompt).toContain('"city"');
    expect(prompt).toContain('"zip"');
    expect(prompt).toContain('"agree"');
    expect(prompt).toContain('boolean');
    // Panel itself should not appear as a field
    expect(prompt).not.toContain('"addressPanel"');
  });

  it('skips signature, signaturepad, html, image, file types', () => {
    const form = {
      pages: [
        {
          name: 'page1',
          elements: [
            { type: 'text', name: 'name', title: 'Name', isRequired: true },
            { type: 'signature', name: 'sig', title: 'Signature' },
            { type: 'signaturepad', name: 'sigPad', title: 'Signature Pad' },
            { type: 'html', name: 'info', html: '<p>Info</p>' },
            { type: 'image', name: 'logo' },
            { type: 'file', name: 'attachment' },
          ],
        },
      ],
    };
    const prompt = adapter.toPrompt(form);
    expect(prompt).toContain('"name"');
    expect(prompt).not.toContain('"sig"');
    expect(prompt).not.toContain('"sigPad"');
    expect(prompt).not.toContain('"info"');
    expect(prompt).not.toContain('"logo"');
    expect(prompt).not.toContain('"attachment"');
  });

  it('handles all remaining question types', () => {
    const form = {
      pages: [
        {
          name: 'page1',
          elements: [
            { type: 'text', name: 'email', title: 'Email', inputType: 'email' },
            { type: 'text', name: 'age', title: 'Age', inputType: 'number' },
            { type: 'text', name: 'dob', title: 'Date of Birth', inputType: 'date' },
            {
              type: 'matrixdynamic',
              name: 'products',
              title: 'Products',
              columns: [
                { name: 'product', text: 'Product' },
                { name: 'qty', text: 'Quantity' },
              ],
            },
            {
              type: 'matrixdropdown',
              name: 'schedule',
              title: 'Schedule',
              rows: [{ value: 'mon', text: 'Monday' }],
              columns: [{ name: 'morning', text: 'Morning' }],
            },
            {
              type: 'multipletext',
              name: 'contacts',
              title: 'Contact Info',
              items: [
                { name: 'phone', title: 'Phone' },
                { name: 'fax', title: 'Fax' },
              ],
            },
            {
              type: 'ranking',
              name: 'priorities',
              title: 'Priorities',
              choices: ['Speed', 'Quality', 'Cost'],
            },
            {
              type: 'imagepicker',
              name: 'favImage',
              title: 'Favorite Image',
              choices: [{ value: 'img1', text: 'Image 1' }, { value: 'img2', text: 'Image 2' }],
            },
            {
              type: 'imagepicker',
              name: 'selectedImages',
              title: 'Selected Images',
              multiSelect: true,
              choices: [{ value: 'a', text: 'A' }, { value: 'b', text: 'B' }],
            },
            { type: 'imagemap', name: 'region', title: 'Region' },
            { type: 'imagemap', name: 'regions', title: 'Regions', multiSelect: true },
            { type: 'slider', name: 'volume', title: 'Volume', min: 0, max: 100, step: 5 },
            {
              type: 'paneldynamic',
              name: 'people',
              title: 'People',
              templateElements: [
                { type: 'text', name: 'pName', title: 'Name' },
                { type: 'text', name: 'pAge', title: 'Age', inputType: 'number' },
              ],
            },
          ],
        },
      ],
    };
    const prompt = adapter.toPrompt(form);
    expect(prompt).toContain('email');
    expect(prompt).toContain('a number');
    expect(prompt).toContain('YYYY-MM-DD');
    expect(prompt).toContain('dynamic matrix');
    expect(prompt).toContain('matrix dropdown');
    expect(prompt).toContain('multiple text inputs');
    expect(prompt).toContain('ranking');
    expect(prompt).toContain('image picker');
    expect(prompt).toContain('image map');
    expect(prompt).toContain('slider');
    expect(prompt).toContain('0 to 100 (step: 5)');
    expect(prompt).toContain('dynamic panel');
    expect(prompt).toContain('Name, Age');
  });

  it('includes validator descriptions', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'text',
            name: 'score',
            title: 'Score',
            validators: [{ type: 'numeric', minValue: 0, maxValue: 100 }],
          },
        ],
      }],
    };
    const prompt = adapter.toPrompt(form);
    expect(prompt).toContain('Validators');
    expect(prompt).toContain('numeric');
  });

  it('returns empty string for empty form', () => {
    expect(adapter.toPrompt({ pages: [] })).toBe('');
    expect(adapter.toPrompt({})).toBe('');
  });

  it('skips signaturepad fields in prompt generation', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'signaturepad', name: 'customerSignature', title: 'Customer Signature', isRequired: true },
        ],
      }],
    };

    const prompt = adapter.toPrompt(form);
    expect(prompt).not.toContain('"customerSignature"');
    expect(prompt).not.toContain('signature pad');
  });
});

// ─── toOutputSchema tests ───────────────────────────────────────

describe('SurveyJSAdapter.toOutputSchema', () => {
  it('builds correct schema for simple form', () => {
    const schema = adapter.toOutputSchema(simpleForm);

    // Valid data
    const valid = { firstName: 'John', gender: 'Male', bio: 'Hello' };
    expect(schema.safeParse(valid).success).toBe(true);

    // Also valid: optional field omitted
    const withoutOptional = { firstName: 'Jane', gender: 'Female' };
    expect(schema.safeParse(withoutOptional).success).toBe(true);

    // All fields are optional in the extraction schema (paper forms can have blank required fields).
    // isRequired is a form-submission concern, not an extraction concern.
    const missingRequired = { gender: 'Male' };
    expect(schema.safeParse(missingRequired).success).toBe(true);

    // Invalid: wrong enum value (type errors still caught)
    const badEnum = { firstName: 'John', gender: 'Unknown' };
    expect(schema.safeParse(badEnum).success).toBe(false);
  });

  it('builds correct schema for complex form', () => {
    const schema = adapter.toOutputSchema(complexForm);

    const valid = {
      quality: { speed: 'good', reliability: 'excellent' },
      overall: 8,
      features: ['Speed', 'Security'],
      experience: 'Advanced',
    };
    expect(schema.safeParse(valid).success).toBe(true);

    // Invalid: rating should be number
    const badRating = { quality: {}, overall: 'great', features: [], experience: 'Beginner' };
    expect(schema.safeParse(badRating).success).toBe(false);

    // Invalid: experience wrong enum
    const badExp = { quality: {}, overall: 5, experience: 'Expert' };
    expect(schema.safeParse(badExp).success).toBe(false);
  });

  it('builds correct schema for nested form with panels', () => {
    const schema = adapter.toOutputSchema(nestedForm);

    const valid = {
      fullName: 'John Doe',
      street: '123 Main St',
      city: 'Springfield',
      zip: '12345',
      agree: true,
    };
    expect(schema.safeParse(valid).success).toBe(true);

    // All fields are optional in the extraction schema — partial paper forms are valid.
    const missingCity = { fullName: 'John', street: '123 Main St', agree: true };
    expect(schema.safeParse(missingCity).success).toBe(true);

    // Optional zip can be omitted
    const noZip = { fullName: 'John', street: '123 Main St', city: 'X', agree: false };
    expect(schema.safeParse(noZip).success).toBe(true);
  });

  it('skips signature, signaturepad, html, image, file types', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'text', name: 'name', title: 'Name', isRequired: true },
          { type: 'signature', name: 'sig' },
          { type: 'signaturepad', name: 'sigPad' },
          { type: 'html', name: 'info' },
          { type: 'image', name: 'pic' },
          { type: 'file', name: 'doc' },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form) as z.ZodObject<Record<string, z.ZodTypeAny>>;
    const keys = Object.keys(schema.shape);
    expect(keys).toContain('name');
    expect(keys).not.toContain('sig');
    expect(keys).not.toContain('sigPad');
    expect(keys).not.toContain('info');
    expect(keys).not.toContain('pic');
    expect(keys).not.toContain('doc');
  });

  it('does not include signaturepad in output schema', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'signaturepad', name: 'customerSignature', title: 'Customer Signature', isRequired: true },
        ],
      }],
    };

    const schema = adapter.toOutputSchema(form);
    const parsed = schema.safeParse({ customerSignature: 'iVBORw0KGgoAAAANSUhEUgAAAAUA' });
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error('Expected schema parse to succeed');
    }
    expect(parsed.data).toEqual({});
  });

  it('ignores non-array rows metadata during normalization', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'comment', name: 'notes', title: 'Notes', rows: 2 },
          { type: 'text', name: 'studentName', title: 'Student Name', isRequired: true },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      'Student Name': 'John Doe',
      Notes: 'Bring lunch',
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected normalization with numeric rows metadata to succeed');
    }

    expect(result.data).toEqual({
      studentName: 'John Doe',
      notes: 'Bring lunch',
    });
  });

  it('maps inputType=number to z.number()', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'text', name: 'age', title: 'Age', inputType: 'number', isRequired: true },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ age: 25 }).success).toBe(true);
    expect(schema.safeParse({ age: 'twenty' }).success).toBe(false);
  });

  it('handles checkbox as array', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'checkbox', name: 'items', title: 'Items', isRequired: true, choices: ['A', 'B'] },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ items: ['A'] }).success).toBe(true);
    expect(schema.safeParse({ items: 'A' }).success).toBe(false);
  });

  it('uses choice values for radiogroup enum with {value, text} choices', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [{
          type: 'radiogroup',
          name: 'color',
          title: 'Color',
          isRequired: true,
          choices: [
            { value: 'red', text: 'Red Color' },
            { value: 'green', text: 'Green Color' },
            { value: 'blue', text: 'Blue Color' },
          ],
        }],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    // Accepts value strings, not display text
    expect(schema.safeParse({ color: 'red' }).success).toBe(true);
    expect(schema.safeParse({ color: 'green' }).success).toBe(true);
    // Rejects display text
    expect(schema.safeParse({ color: 'Red Color' }).success).toBe(false);
    // Rejects unknown values
    expect(schema.safeParse({ color: 'yellow' }).success).toBe(false);
  });

  it('validates checkbox with {value, text} choices as array of strings', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [{
          type: 'checkbox',
          name: 'colors',
          title: 'Colors',
          isRequired: true,
          choices: [
            { value: 'red', text: 'Red Color' },
            { value: 'green', text: 'Green Color' },
          ],
        }],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ colors: ['red', 'green'] }).success).toBe(true);
    expect(schema.safeParse({ colors: ['red'] }).success).toBe(true);
    expect(schema.safeParse({ colors: 'red' }).success).toBe(false);
  });

  it('handles tagbox as array (like checkbox)', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'tagbox', name: 'tags', title: 'Tags', isRequired: true, choices: ['X', 'Y', 'Z'] },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ tags: ['X', 'Y'] }).success).toBe(true);
    expect(schema.safeParse({ tags: 'X' }).success).toBe(false);
  });

  it('handles boolean type', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'boolean', name: 'ok', title: 'OK?', isRequired: true },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ ok: true }).success).toBe(true);
    expect(schema.safeParse({ ok: 'yes' }).success).toBe(false);
  });

  it('handles imagepicker single vs multi', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'imagepicker', name: 'single', title: 'Pick one', choices: [{ value: 'a' }], isRequired: true },
          { type: 'imagepicker', name: 'multi', title: 'Pick many', multiSelect: true, choices: [{ value: 'a' }], isRequired: true },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ single: 'a', multi: ['a'] }).success).toBe(true);
    expect(schema.safeParse({ single: ['a'], multi: 'a' }).success).toBe(false);
  });

  it('handles slider as number', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'slider', name: 'val', title: 'Value', isRequired: true },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ val: 50 }).success).toBe(true);
    expect(schema.safeParse({ val: 'fifty' }).success).toBe(false);
  });

  it('handles paneldynamic as array of records', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'paneldynamic',
            name: 'people',
            title: 'People',
            isRequired: true,
            templateElements: [{ type: 'text', name: 'n', title: 'Name' }],
          },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ people: [{ n: 'Alice' }] }).success).toBe(true);
    expect(schema.safeParse({ people: 'Alice' }).success).toBe(false);
  });

  it('handles ranking as ordered array', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'ranking', name: 'rank', title: 'Rank', isRequired: true, choices: ['A', 'B', 'C'] },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ rank: ['B', 'A', 'C'] }).success).toBe(true);
    expect(schema.safeParse({ rank: 'A' }).success).toBe(false);
  });

  it('handles multipletext as record of strings', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'multipletext',
            name: 'contacts',
            title: 'Contacts',
            isRequired: true,
            items: [{ name: 'phone' }, { name: 'fax' }],
          },
        ],
      }],
    };
    const schema = adapter.toOutputSchema(form);
    expect(schema.safeParse({ contacts: { phone: '123', fax: '456' } }).success).toBe(true);
    expect(schema.safeParse({ contacts: '123' }).success).toBe(false);
  });

  it('maps multipletext item titles to item names in parsed output', () => {
    const form = {
      pages: [{
        name: 'page1',
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
      }],
    };

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse({
      contacts: {
        'Phone Number': '123',
        'Fax Number': '456',
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected multipletext parsing to succeed');
    }

    expect(result.data.contacts).toEqual({ phone: '123', fax: '456' });
  });

  it('keeps multipletext parsing resilient when extra keys are present', () => {
    const form = {
      pages: [{
        name: 'page1',
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
      }],
    };

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse({
      contacts: {
        'Phone Number': '123',
        'Fax Number': '456',
        noisyArtifact: 'ignore-me',
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected multipletext parsing with extra keys to succeed');
    }

    expect(result.data.contacts.phone).toBe('123');
    expect(result.data.contacts.fax).toBe('456');
  });

  it('maps question titles to question names in parsed output', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'text', name: 'firstName', title: 'First Name', isRequired: true },
          { type: 'text', name: 'lastName', title: 'Last Name', isRequired: true },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      'First Name': 'John',
      'Last Name': 'Doe',
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected question title mapping to succeed');
    }

    expect(result.data).toEqual({ firstName: 'John', lastName: 'Doe' });
  });

  it('maps both question titles and multipletext item titles to names', () => {
    const form = {
      pages: [{
        name: 'page1',
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
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      'First Name': 'John',
      'Contact Information': {
        'Phone Number': '123',
        'Fax Number': '456',
      },
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected combined title mapping to succeed');
    }

    expect(result.data).toEqual({
      firstName: 'John',
      contacts: {
        phone: '123',
        fax: '456',
      },
    });
  });

  it('maps matrixdynamic column titles/text to column names', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'matrixdynamic',
            name: 'products',
            title: 'Products',
            isRequired: true,
            columns: [
              { name: 'product', title: 'Product Name' },
              { name: 'qty', text: 'Quantity' },
            ],
          },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      products: [
        { 'Product Name': 'Laptop', Quantity: 2 },
      ],
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected matrixdynamic mapping to succeed');
    }

    expect(result.data).toEqual({
      products: [{ product: 'Laptop', qty: 2 }],
    });
  });

  it('maps matrixdropdown column titles/text to column names', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'matrixdropdown',
            name: 'schedule',
            title: 'Schedule',
            isRequired: true,
            rows: [{ value: 'mon', text: 'Monday' }],
            columns: [
              { name: 'morning', title: 'Morning Shift' },
              { name: 'evening', text: 'Evening Shift' },
            ],
          },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      schedule: {
        mon: {
          'Morning Shift': 'on-site',
          'Evening Shift': 'remote',
        },
      },
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected matrixdropdown mapping to succeed');
    }

    expect(result.data).toEqual({
      schedule: {
        mon: {
          morning: 'on-site',
          evening: 'remote',
        },
      },
    });
  });

  it('maps choice text to choice value for single and multiple choice questions', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'radiogroup',
            name: 'color',
            title: 'Color',
            isRequired: true,
            choices: [
              { value: 'red', text: 'Red Color' },
              { value: 'green', text: 'Green Color' },
            ],
          },
          {
            type: 'checkbox',
            name: 'features',
            title: 'Features',
            isRequired: true,
            choices: [
              { value: 'speed', text: 'Fast Speed' },
              { value: 'secure', text: 'Strong Security' },
            ],
          },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      color: 'Red Color',
      features: ['Fast Speed', 'Strong Security'],
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected choice text mapping to succeed');
    }

    expect(result.data).toEqual({
      color: 'red',
      features: ['speed', 'secure'],
    });
  });

  it('maps matrix row text and matrix selected column text to values', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'matrix',
            name: 'quality',
            title: 'Quality',
            isRequired: true,
            rows: [
              { value: 'speed', text: 'Speed' },
              { value: 'reliability', text: 'Reliability' },
            ],
            columns: [
              { value: 'poor', text: 'Poor' },
              { value: 'good', text: 'Good' },
            ],
          },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      quality: {
        Speed: 'Good',
        Reliability: 'Poor',
      },
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected matrix row and value mapping to succeed');
    }

    expect(result.data).toEqual({
      quality: {
        speed: 'good',
        reliability: 'poor',
      },
    });
  });

  it('maps matrixdropdown row text to row values', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'matrixdropdown',
            name: 'schedule',
            title: 'Schedule',
            isRequired: true,
            rows: [{ value: 'mon', text: 'Monday' }],
            columns: [
              { name: 'morning', title: 'Morning Shift' },
            ],
          },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      schedule: {
        Monday: {
          'Morning Shift': 'on-site',
        },
      },
    });

    const schema = adapter.toOutputSchema(form);
    const result = schema.safeParse(normalized);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected matrixdropdown row mapping to succeed');
    }

    expect(result.data).toEqual({
      schedule: {
        mon: {
          morning: 'on-site',
        },
      },
    });
  });

  it('leaves unsupported signaturepad data untouched during normalization', () => {
    const form = {
      pages: [{
        name: 'page1',
        elements: [
          { type: 'signaturepad', name: 'customerSignature', title: 'Customer Signature', isRequired: true },
        ],
      }],
    };

    const normalized = adapter.normalizeResponseData(form, {
      customerSignature: '  iVBORw0KGgoAAAANSUhEUgAAAAUA  ',
    });

    expect(normalized).toEqual({
      customerSignature: '  iVBORw0KGgoAAAANSUhEUgAAAAUA  ',
    });
  });
});
