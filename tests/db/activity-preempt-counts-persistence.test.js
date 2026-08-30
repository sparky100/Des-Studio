// Schema contract round-trip test (see CLAUDE.md): summary.activityCounts and
// summary.preemptCounts are new fields on getSummary()'s returned object
// (src/engine/index.js) — this confirms they survive buildPersistedResultsJson
// unchanged, since both flow through the generic `summary` spread rather than
// an explicit per-field allowlist (no results_json/DB column changes needed).

import { describe, it, expect } from 'vitest';
import { buildPersistedResultsJson } from '../../src/db/results-persistence.js';

describe('activityCounts / preemptCounts persistence round-trip', () => {
  it('persists summary.activityCounts unchanged', () => {
    const result = {
      summary: {
        avgWait: 3, served: 10,
        activityCounts: { repair: { name: 'Repair Job', count: 4 } },
      },
    };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.summary.activityCounts).toEqual({ repair: { name: 'Repair Job', count: 4 } });
  });

  it('persists summary.preemptCounts unchanged, including its byReason breakdown', () => {
    const result = {
      summary: {
        avgWait: 3, served: 10,
        preemptCounts: { RepairJob: { total: 4, byReason: { PREEMPT: 3, FAILURE: 1 } } },
      },
    };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.summary.preemptCounts).toEqual({ RepairJob: { total: 4, byReason: { PREEMPT: 3, FAILURE: 1 } } });
  });

  it('omits both fields when the run had no activity/preemption data', () => {
    const result = { summary: { avgWait: 3, served: 10 } };
    const payload = buildPersistedResultsJson(result, {});
    expect(payload.summary.activityCounts).toBeUndefined();
    expect(payload.summary.preemptCounts).toBeUndefined();
  });
});
