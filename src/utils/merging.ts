import type { ExtractionResult, FieldConfidence } from '../core/types';

/**
 * Merge online responses with paper form extractions.
 * Deduplicates by unique ID.
 */

export interface MergeOptions {
  /** Strategy when same field exists in both sources */
  conflictResolution?: 'prefer-online' | 'prefer-paper' | 'highest-confidence';
}

export interface MergedRecord {
  [key: string]: unknown;
  _source: 'merged' | 'online' | 'paper';
  _uniqueId: string | null;
  _mergeDetails?: Record<string, 'online' | 'paper'>;
}

function getConfidenceForField(
  confidence: FieldConfidence[],
  fieldName: string
): number {
  const entry = confidence.find((c) => c.fieldName === fieldName);
  return entry ? entry.confidence : 0;
}

function mergeFields(
  onlineRecord: Record<string, unknown>,
  paperData: Record<string, unknown>,
  paperConfidence: FieldConfidence[],
  strategy: 'prefer-online' | 'prefer-paper' | 'highest-confidence'
): { merged: Record<string, unknown>; details: Record<string, 'online' | 'paper'> } {
  const merged: Record<string, unknown> = {};
  const details: Record<string, 'online' | 'paper'> = {};

  const allKeys = new Set([
    ...Object.keys(onlineRecord).filter((k) => k !== 'uniqueId'),
    ...Object.keys(paperData),
  ]);

  for (const key of allKeys) {
    const inOnline = key in onlineRecord;
    const inPaper = key in paperData;

    if (inOnline && inPaper) {
      if (strategy === 'prefer-online') {
        merged[key] = onlineRecord[key];
        details[key] = 'online';
      } else if (strategy === 'prefer-paper') {
        merged[key] = paperData[key];
        details[key] = 'paper';
      } else {
        // highest-confidence
        const onlineConf = 1.0;
        const paperConf = getConfidenceForField(paperConfidence, key);
        if (paperConf > onlineConf) {
          merged[key] = paperData[key];
          details[key] = 'paper';
        } else {
          // equal or online higher → prefer online
          merged[key] = onlineRecord[key];
          details[key] = 'online';
        }
      }
    } else if (inOnline) {
      merged[key] = onlineRecord[key];
      details[key] = 'online';
    } else {
      merged[key] = paperData[key];
      details[key] = 'paper';
    }
  }

  return { merged, details };
}

/**
 * Merge online and paper-extracted responses.
 * Matches records by unique ID and combines fields.
 */
export function mergeResponses(
  onlineData: Record<string, unknown>[],
  paperExtractions: ExtractionResult[],
  options?: MergeOptions
): MergedRecord[] {
  const strategy = options?.conflictResolution ?? 'prefer-online';
  const results: MergedRecord[] = [];

  // 1. Index online data by uniqueId
  const onlineByUniqueId = new Map<string, Record<string, unknown>>();
  const onlineWithoutId: Record<string, unknown>[] = [];
  const matchedOnlineIds = new Set<string>();

  for (const record of onlineData) {
    const uid = record.uniqueId;
    if (typeof uid === 'string' && uid) {
      onlineByUniqueId.set(uid, record);
    } else {
      onlineWithoutId.push(record);
    }
  }

  // 2. Process paper extractions
  // Group paper extractions by uniqueId for merging multiples with same ID
  const paperByUniqueId = new Map<string, ExtractionResult[]>();
  const paperWithoutId: ExtractionResult[] = [];

  for (const extraction of paperExtractions) {
    if (extraction.uniqueId != null && extraction.uniqueId !== '') {
      const existing = paperByUniqueId.get(extraction.uniqueId) ?? [];
      existing.push(extraction);
      paperByUniqueId.set(extraction.uniqueId, existing);
    } else {
      paperWithoutId.push(extraction);
    }
  }

  // Process matched paper extractions
  for (const [uid, extractions] of paperByUniqueId) {
    const onlineRecord = onlineByUniqueId.get(uid);

    if (onlineRecord) {
      matchedOnlineIds.add(uid);

      // Merge all paper extractions in order into a combined paper record
      let combinedPaperData: Record<string, unknown> = {};
      const combinedConfidenceByField = new Map<string, FieldConfidence>();

      for (const extraction of extractions) {
        combinedPaperData = { ...combinedPaperData, ...extraction.data };
        // Later extractions' confidence entries override earlier ones for same fields
        for (const fc of extraction.confidence) {
          combinedConfidenceByField.set(fc.fieldName, fc);
        }
      }

      const combinedConfidence = Array.from(combinedConfidenceByField.values());

      const { merged, details } = mergeFields(
        onlineRecord,
        combinedPaperData,
        combinedConfidence,
        strategy
      );

      results.push({
        ...merged,
        _source: 'merged',
        _uniqueId: uid,
        _mergeDetails: details,
      });
    } else {
      // No matching online record — merge paper extractions together
      let combinedData: Record<string, unknown> = {};
      for (const extraction of extractions) {
        combinedData = { ...combinedData, ...extraction.data };
      }

      results.push({
        ...combinedData,
        _source: 'paper',
        _uniqueId: uid,
      });
    }
  }

  // Unmatched paper extractions (null uniqueId)
  for (const extraction of paperWithoutId) {
    results.push({
      ...extraction.data,
      _source: 'paper',
      _uniqueId: null,
    });
  }

  // 3. Add unmatched online responses
  for (const [uid, record] of onlineByUniqueId) {
    if (!matchedOnlineIds.has(uid)) {
      const { uniqueId: _omit, ...rest } = record;
      void _omit;
      results.push({
        ...rest,
        _source: 'online',
        _uniqueId: uid,
      });
    }
  }

  for (const record of onlineWithoutId) {
    const { uniqueId: _omit2, ...rest } = record;
    void _omit2;
    results.push({
      ...rest,
      _source: 'online',
      _uniqueId: null,
    });
  }

  return results;
}
