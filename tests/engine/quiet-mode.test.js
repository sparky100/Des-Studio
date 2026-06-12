// tests/engine/quiet-mode.test.js
//
// collectTrace=false ("quiet mode") must suppress all trace/log output while
// leaving simulation behaviour bit-identical — trace is observational only.
// Batch replication paths run quiet; single runs keep the default (trace on).

import { describe, expect, test } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { runReplicationPayload } from '../../src/engine/worker.js';
import { makeMM1Model } from './__helpers__/benchmarkFixtures.js';

const model = makeMM1Model(0.9, 1.0);

function run(options) {
  return buildEngine(model, 42, 50, 500, null, 20000, 500, false, undefined, options).runAll();
}

describe('quiet mode (collectTrace: false)', () => {
  test('suppresses log and trace output', () => {
    const result = run({ collectTrace: false });
    expect(result.log).toEqual([]);
    expect(result.trace).toBeUndefined();
    expect(result.traceTruncated).toBeUndefined();
  });

  test('default mode still produces log and trace', () => {
    const result = run({});
    expect(result.log.length).toBeGreaterThan(0);
    expect(Array.isArray(result.trace)).toBe(true);
  });

  test('quiet and default runs are bit-identical on all load-bearing output', () => {
    const quiet = run({ collectTrace: false });
    const traced = run({});

    expect(quiet.summary).toEqual(traced.summary);
    expect(quiet.finalTime).toBe(traced.finalTime);
    expect(quiet.runtimeMetrics).toEqual(traced.runtimeMetrics);
    expect(quiet.waitDist).toEqual(traced.waitDist);
    expect(quiet.entitySummary.length).toBe(traced.entitySummary.length);
    expect(quiet.warnings).toEqual(traced.warnings);
  });

  test('worker replication payloads run quiet when shared config disables trace', () => {
    const payload = runReplicationPayload(
      { replicationIndex: 0, seed: 42 },
      { model, warmupPeriod: 0, maxSimTime: 100, collectTrace: false }
    );
    expect(payload.result.log).toEqual([]);
    expect(payload.result.trace).toBeUndefined();
    expect(payload.result.summary.served).toBeGreaterThan(0);
  });
});
