// Schema contract round-trip test (see CLAUDE.md): estimateAccuracy is a new
// derived field attached to results_json by buildPersistedResultsJson, comparing
// the pre-run complexity estimate to the post-run runtimeMetrics. It needs
// explicit persistence coverage like every other field added to results_json.

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

function makeResult() {
  return {
    summary: { avgWait: 3, served: 10 },
    runtimeMetrics: { c_event_scans: 1200, entities_created: 90 },
  };
}

describe('estimateAccuracy persistence round-trip', () => {
  it('attaches estimateAccuracy when both complexityEstimate and runtimeMetrics are present', () => {
    const payload = buildPersistedResultsJson(makeResult(), {
      resultDetailLevel: 'full',
      complexityEstimate: { estimatedCEventScans: 1000, expectedEntities: 100 },
    });

    expect(payload.estimateAccuracy).toEqual({
      scansEstimated: 1000,
      scansActual: 1200,
      scansRatio: 1.2,
      entitiesEstimated: 100,
      entitiesActual: 90,
      entitiesRatio: 0.9,
    });
  });

  it('omits estimateAccuracy when no complexityEstimate is supplied', () => {
    const payload = buildPersistedResultsJson(makeResult(), { resultDetailLevel: 'full' });
    expect(payload.estimateAccuracy).toBeUndefined();
  });

  it('omits estimateAccuracy when the result has no runtimeMetrics', () => {
    const payload = buildPersistedResultsJson(
      { summary: { avgWait: 3, served: 10 } },
      { resultDetailLevel: 'full', complexityEstimate: { estimatedCEventScans: 1000, expectedEntities: 100 } },
    );
    expect(payload.estimateAccuracy).toBeUndefined();
  });
});
