// Integration test for condition-triggered shiftSchedule entries, modeled on
// the spec's "heat pump installer" scenario: an installer crew whose capacity
// expands as more trainees become qualified.
//
// No existing heat-pump/installer fixture was found in this repo (searched
// docs/addition1_entity_model.md, docs/simmodlr_Build_Plan.md, tests/, and
// tests/benchmarks/ for "heat pump"/"installer"/"et_installer" — none exist),
// so this test builds a minimal inline model per the spec's fallback instruction.
import { describe, expect, test } from 'vitest';
import { buildEngine } from '../index.js';

function makeInstallerModel() {
  return {
    entityTypes: [
      { id: 'et_job', name: 'InstallJob', role: 'customer', attrDefs: [] },
      {
        id: 'et_installer',
        name: 'Installer',
        role: 'server',
        count: '6',
        attrDefs: [],
        shiftSchedule: [
          { time: 0, capacity: 6 },
          { when: { variable: 'state.traineesQualified', operator: '>=', value: 20 }, capacity: 8 },
          { when: { variable: 'state.traineesQualified', operator: '>=', value: 40 }, capacity: 10 },
        ],
      },
    ],
    stateVariables: [
      { name: 'traineesQualified', initialValue: '0' },
    ],
    queues: [
      { id: 'q_jobs', name: 'JobQueue', entityTypeId: 'et_job' },
    ],
    bEvents: [
      {
        id: 'b_job_arrive',
        name: 'Job arrives',
        scheduledTime: '0',
        effect: 'ARRIVE(InstallJob, JobQueue)',
        schedules: [{ eventId: 'b_job_arrive', dist: 'Exponential', distParams: { mean: '4' } }],
      },
      {
        id: 'b_trainee_qualified',
        name: 'Trainee qualified',
        scheduledTime: '0',
        effect: 'SET(traineesQualified, traineesQualified + 1)',
        schedules: [{ eventId: 'b_trainee_qualified', dist: 'Exponential', distParams: { mean: '20' } }],
      },
      {
        id: 'b_job_complete',
        name: 'Job complete',
        scheduledTime: '9999',
        effect: 'COMPLETE()',
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: 'c_assign',
        name: 'Assign installer',
        condition: 'queue(InstallJob).length > 0 AND idle(Installer).count > 0',
        effect: 'ASSIGN(JobQueue, Installer)',
        cSchedules: [
          { eventId: 'b_job_complete', dist: 'Exponential', distParams: { mean: '2' }, useEntityCtx: true },
        ],
      },
    ],
  };
}

function runReps(model, reps, baseSeed, warmupPeriod, maxSimTime) {
  const results = [];
  for (let i = 0; i < reps; i++) {
    results.push(buildEngine(model, baseSeed + i, warmupPeriod, maxSimTime).runAll());
  }
  return results;
}

describe('installer crew capacity expansion via shiftSchedule `when` (integration)', () => {
  const REPS = 20;
  const results = runReps(makeInstallerModel(), REPS, 1000, 0, 2000);

  test('capacity expands to 8 at traineesQualified=20 and to 10 at =40 in every replication', () => {
    for (const result of results) {
      expect(result.snap.scalars.traineesQualified).toBeGreaterThanOrEqual(40);
      expect(result.snap.byType.Installer.total).toBe(10);
      expect(result.log.some(e => e.message?.includes('SHIFT_CHANGE: Installer capacity -> 8'))).toBe(true);
      expect(result.log.some(e => e.message?.includes('SHIFT_CHANGE: Installer capacity -> 10'))).toBe(true);
    }
  });

  test('installer utilization stays low (~10-12%) — capacity comfortably exceeds demand', () => {
    for (const result of results) {
      const summary = result.summary;
      const installerUtil = summary?.byType?.Installer?.utilization
        ?? summary?.resourceUtilization?.Installer
        ?? null;
      // Fall back to busy/total ratio from the final snapshot if summary doesn't expose utilization directly.
      const byType = result.snap.byType.Installer;
      const approxUtil = installerUtil ?? (byType.busy / byType.total);
      expect(approxUtil).toBeLessThan(0.30); // generous upper bound around the ~10-12% target
    }
  });

  test('expansion timing varies across replications (not identical clock each time)', () => {
    const firstExpansionTimes = results.map(result => {
      const entry = result.log.find(e => e.message?.includes('SHIFT_CHANGE: Installer capacity -> 8'));
      return entry?.time;
    });
    expect(firstExpansionTimes.every(t => t != null)).toBe(true);
    const distinctTimes = new Set(firstExpansionTimes.map(t => t.toFixed(3)));
    expect(distinctTimes.size).toBeGreaterThan(1);
  });
});
