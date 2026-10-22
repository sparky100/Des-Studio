// Every summary field a Study objective may name must be one the engine
// actually reports — a renamed engine field otherwise leaves the objective
// silently resolving to nothing (avgWaitByLittle → avgTimeInSystemByLittle).
import { describe, it, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { TEMPLATES } from '../../src/engine/templates.js';
import { SUMMARY_METRIC_FIELDS } from '../../src/contracts/study';

describe('SUMMARY_METRIC_FIELDS', () => {
  it('names only fields present in an engine run summary', () => {
    const mm1 = TEMPLATES.find(t => t.id === 'mm1');
    const summary = buildEngine(mm1, 1, 0, 200).runAll().summary;
    const missing = SUMMARY_METRIC_FIELDS.filter(f => !(f in summary));
    expect(missing).toEqual([]);
  });
});
