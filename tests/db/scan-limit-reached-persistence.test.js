// Schema contract round-trip test (see CLAUDE.md): scanLimitReached (the
// per-replication C-event scan cap, RA7) flows into results_json via
// buildPersistedResultsJson alongside cycleLimitReached.

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

describe('scanLimitReached persistence round-trip', () => {
  it('persists scanLimitReached on both the top level and summary when set on the result', () => {
    const result = { summary: { avgWait: 3, served: 10 }, scanLimitReached: true };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.scanLimitReached).toBe(true);
    expect(payload.summary.scanLimitReached).toBe(true);
  });

  it('keeps the batch replication count from the aggregated summary', () => {
    const result = { summary: { avgWait: 3, served: 10, scanLimitReached: true, scanLimitReplicationCount: 2 } };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.scanLimitReached).toBe(true);
    expect(payload.summary.scanLimitReplicationCount).toBe(2);
  });

  it('omits scanLimitReached when no replication hit the cap', () => {
    const payload = buildPersistedResultsJson({ summary: { avgWait: 3, served: 10 } }, {});
    expect(payload.scanLimitReached).toBeUndefined();
    expect(payload.summary.scanLimitReached).toBeUndefined();
  });
});
