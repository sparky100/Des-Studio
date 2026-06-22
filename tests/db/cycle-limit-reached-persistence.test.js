// Schema contract round-trip test (see CLAUDE.md): cycleLimitReached flows into
// results_json via buildPersistedResultsJson, mirroring the existing
// phaseCTruncated propagation pattern, so it needs explicit coverage.

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

describe('cycleLimitReached persistence round-trip', () => {
  it('persists cycleLimitReached on both the top level and summary when set on the result', () => {
    const result = { summary: { avgWait: 3, served: 10 }, cycleLimitReached: true };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.cycleLimitReached).toBe(true);
    expect(payload.summary.cycleLimitReached).toBe(true);
  });

  it('persists cycleLimitReached when only present on summary (batch-aggregated shape)', () => {
    const result = { summary: { avgWait: 3, served: 10, cycleLimitReached: true } };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.cycleLimitReached).toBe(true);
    expect(payload.summary.cycleLimitReached).toBe(true);
  });

  it('omits cycleLimitReached when the run completed within its cycle cap', () => {
    const result = { summary: { avgWait: 3, served: 10 } };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.cycleLimitReached).toBeUndefined();
    expect(payload.summary.cycleLimitReached).toBeUndefined();
  });
});
