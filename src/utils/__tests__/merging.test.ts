import { describe, it, expect } from 'vitest';
import { mergeResponses } from '../merging';
import type { ExtractionResult } from '../../core/types';

function makeExtraction(
  data: Record<string, unknown>,
  uniqueId: string | null,
  confidence: { fieldName: string; value: unknown; confidence: number }[] = []
): ExtractionResult {
  return {
    data,
    uniqueId,
    confidence: confidence.map((c) => ({ ...c, flagged: c.confidence < 0.75 })),
  };
}

describe('mergeResponses', () => {
  it('basic match — one online + one paper with same uniqueId → merged result', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice', age: 30 }];
    const paper = [makeExtraction({ name: 'Alice', score: 95 }, 'id-1', [
      { fieldName: 'name', value: 'Alice', confidence: 0.9 },
      { fieldName: 'score', value: 95, confidence: 0.8 },
    ])];

    const result = mergeResponses(online, paper);

    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('merged');
    expect(result[0]._uniqueId).toBe('id-1');
    expect(result[0].name).toBe('Alice'); // same in both
    expect(result[0].age).toBe(30); // only online
    expect(result[0].score).toBe(95); // only paper
  });

  it('prefer-online strategy — conflicting field values, online wins', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice' }];
    const paper = [makeExtraction({ name: 'Bob' }, 'id-1', [
      { fieldName: 'name', value: 'Bob', confidence: 0.9 },
    ])];

    const result = mergeResponses(online, paper, { conflictResolution: 'prefer-online' });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    expect(result[0]._mergeDetails!.name).toBe('online');
  });

  it('prefer-paper strategy — conflicting field values, paper wins', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice' }];
    const paper = [makeExtraction({ name: 'Bob' }, 'id-1', [
      { fieldName: 'name', value: 'Bob', confidence: 0.9 },
    ])];

    const result = mergeResponses(online, paper, { conflictResolution: 'prefer-paper' });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
    expect(result[0]._mergeDetails!.name).toBe('paper');
  });

  it('highest-confidence strategy — pick by confidence score', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice', city: 'NYC' }];
    const paper = [makeExtraction({ name: 'Bob', city: 'LA' }, 'id-1', [
      { fieldName: 'name', value: 'Bob', confidence: 0.5 },
      { fieldName: 'city', value: 'LA', confidence: 1.0 },
    ])];

    const result = mergeResponses(online, paper, { conflictResolution: 'highest-confidence' });

    expect(result).toHaveLength(1);
    // name: online conf=1.0 > paper conf=0.5 → Alice
    expect(result[0].name).toBe('Alice');
    expect(result[0]._mergeDetails!.name).toBe('online');
    // city: equal confidence (1.0 = 1.0) → prefer online
    expect(result[0].city).toBe('NYC');
    expect(result[0]._mergeDetails!.city).toBe('online');
  });

  it('highest-confidence — equal confidence prefers online', () => {
    const online = [{ uniqueId: 'id-1', score: 80 }];
    const paper = [makeExtraction({ score: 90 }, 'id-1', [
      { fieldName: 'score', value: 90, confidence: 1.0 },
    ])];

    // Paper confidence 1.0 is NOT > online 1.0, so equal → prefer online
    const result = mergeResponses(online, paper, { conflictResolution: 'highest-confidence' });
    expect(result[0].score).toBe(80);
  });

  it('unmatched online — online response with no paper match → _source online', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice' }];
    const paper: ExtractionResult[] = [];

    const result = mergeResponses(online, paper);

    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('online');
    expect(result[0]._uniqueId).toBe('id-1');
    expect(result[0].name).toBe('Alice');
  });

  it('unmatched paper — paper extraction with no online match → _source paper', () => {
    const online: Record<string, unknown>[] = [];
    const paper = [makeExtraction({ name: 'Bob' }, 'id-2')];

    const result = mergeResponses(online, paper);

    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('paper');
    expect(result[0]._uniqueId).toBe('id-2');
    expect(result[0].name).toBe('Bob');
  });

  it('null uniqueId on paper — treated as unmatched', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice' }];
    const paper = [makeExtraction({ name: 'Charlie' }, null)];

    const result = mergeResponses(online, paper);

    expect(result).toHaveLength(2);
    const paperRecord = result.find((r) => r._source === 'paper');
    expect(paperRecord).toBeDefined();
    expect(paperRecord!._uniqueId).toBeNull();
    expect(paperRecord!.name).toBe('Charlie');

    const onlineRecord = result.find((r) => r._source === 'online');
    expect(onlineRecord).toBeDefined();
    expect(onlineRecord!.name).toBe('Alice');
  });

  it('multiple paper extractions with same ID — merged in order', () => {
    const online = [{ uniqueId: 'id-1', name: 'Alice' }];
    const paper = [
      makeExtraction({ q1: 'answer1', q2: 'first' }, 'id-1', [
        { fieldName: 'q1', value: 'answer1', confidence: 0.8 },
        { fieldName: 'q2', value: 'first', confidence: 0.7 },
      ]),
      makeExtraction({ q2: 'second', q3: 'answer3' }, 'id-1', [
        { fieldName: 'q2', value: 'second', confidence: 0.9 },
        { fieldName: 'q3', value: 'answer3', confidence: 0.85 },
      ]),
    ];

    const result = mergeResponses(online, paper, { conflictResolution: 'prefer-paper' });

    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('merged');
    // q2 should be 'second' (later paper overwrites earlier)
    expect(result[0].q2).toBe('second');
    expect(result[0].q1).toBe('answer1');
    expect(result[0].q3).toBe('answer3');
    expect(result[0].name).toBe('Alice'); // from online, no conflict with paper for 'name'
  });

  it('empty inputs — both empty arrays → empty result', () => {
    const result = mergeResponses([], []);
    expect(result).toEqual([]);
  });

  it('non-overlapping fields — online has field A, paper has field B → merged has both', () => {
    const online = [{ uniqueId: 'id-1', fieldA: 'valueA' }];
    const paper = [makeExtraction({ fieldB: 'valueB' }, 'id-1', [
      { fieldName: 'fieldB', value: 'valueB', confidence: 0.95 },
    ])];

    const result = mergeResponses(online, paper);

    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('merged');
    expect(result[0].fieldA).toBe('valueA');
    expect(result[0].fieldB).toBe('valueB');
    expect(result[0]._mergeDetails!.fieldA).toBe('online');
    expect(result[0]._mergeDetails!.fieldB).toBe('paper');
  });

  it('online record with no uniqueId field — included as unmatched online', () => {
    const online = [{ name: 'NoId' }];
    const paper: ExtractionResult[] = [];

    const result = mergeResponses(online, paper);

    expect(result).toHaveLength(1);
    expect(result[0]._source).toBe('online');
    expect(result[0]._uniqueId).toBeNull();
    expect(result[0].name).toBe('NoId');
  });

  it('default conflict resolution is prefer-online', () => {
    const online = [{ uniqueId: 'id-1', field: 'online-val' }];
    const paper = [makeExtraction({ field: 'paper-val' }, 'id-1', [
      { fieldName: 'field', value: 'paper-val', confidence: 0.9 },
    ])];

    const result = mergeResponses(online, paper);

    expect(result[0].field).toBe('online-val');
  });
});
