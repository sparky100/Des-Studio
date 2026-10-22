// Per-shift utilisation: a job that spans a shift change is split between the
// shifts, completions count in the shift the job finished, and periods that
// fall entirely inside warm-up are not reported.
import { describe, expect, it } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function model({ shifts, service = '150', arrivals = '0' } = {}) {
  return {
    entityTypes: [
      { id: 'p', name: 'Patient', role: 'customer', attrDefs: [] },
      { id: 'd', name: 'Doctor', role: 'server', count: 1, attrDefs: [], shiftSchedule: shifts },
    ],
    stateVariables: [], queues: [{ id: 'q', name: 'Q', customerType: 'Patient' }],
    bEvents: [
      { id: 'a', name: 'Arr', scheduledTime: arrivals, effect: ['ARRIVE(Patient, Q)'], schedules: [] },
      { id: 'done', name: 'Done', scheduledTime: '1e12', effect: ['COMPLETE()'], schedules: [] },
    ],
    cEvents: [{ id: 'c', name: 'Consult', priority: 1, condition: 'queue(Q).length > 0 AND idle(Doctor).count > 0', effect: ['ASSIGN(Q, Doctor)'],
      cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: service }, useEntityCtx: true }] }],
  };
}

describe('per-shift utilisation attribution', () => {
  it('splits a job across the shift change and counts its completion in the later shift', () => {
    const m = model({ shifts: [{ time: '0', capacity: '1' }, { time: '100', capacity: '1' }] });
    const r = buildEngine(m, 1, 0, 300).runAll();
    const [first, second] = r.summary.perResource.Doctor.perShiftUtil;
    expect(first).toMatchObject({ startTime: 0, busyTimeSum: 100, completions: 0, utilisation: 1 });
    expect(second).toMatchObject({ startTime: 100, busyTimeSum: 50, completions: 1 });
    expect(second.utilisation).toBeCloseTo(50 / 200, 4);
  });

  it('counts a job that held two units of a type as one completion', () => {
    const m = {
      entityTypes: [
        { id: 'p', name: 'Patient', role: 'customer', attrDefs: [] },
        { id: 'd', name: 'Doctor', role: 'server', count: 2, attrDefs: [], shiftSchedule: [{ time: '0', capacity: '2' }] },
      ],
      stateVariables: [], queues: [{ id: 'q', name: 'Q', customerType: 'Patient' }, { id: 'out', name: 'Done', customerType: 'Patient' }],
      bEvents: [
        { id: 'a', name: 'Arr', scheduledTime: '0', effect: ['ARRIVE(Patient, Q)'], schedules: [] },
        { id: 'rel', name: 'Release', scheduledTime: '1e12', effect: ['RELEASE_COSEIZED([Doctor], Done)'], schedules: [] },
      ],
      cEvents: [{ id: 'c', name: 'Team', priority: 1, condition: 'queue(Q).length > 0 AND idle(Doctor).count >= 2', effect: ['COSEIZE(Q, Doctor:2)'],
        cSchedules: [{ eventId: 'rel', dist: 'Fixed', distParams: { value: '10' }, useEntityCtx: true }] }],
    };
    const [shift] = buildEngine(m, 1, 0, 100).runAll().summary.perResource.Doctor.perShiftUtil;
    expect(shift.busyTimeSum).toBe(20);
    expect(shift.completions).toBe(1);
  });

  it('omits shift periods that ended before warm-up finished', () => {
    const m = model({ shifts: [{ time: '0', capacity: '1' }, { time: '50', capacity: '1' }, { time: '100', capacity: '1' }], service: '10', arrivals: '120' });
    const r = buildEngine(m, 1, 100, 300).runAll();
    const starts = r.summary.perResource.Doctor.perShiftUtil.map(p => p.startTime);
    expect(starts).toEqual([100]);
  });

  it('measures the sustained ≥90% stretch after warm-up only', () => {
    // The only doctor is busy from t=0 to t=200; warm-up ends at t=150.
    const m = model({ shifts: [{ time: '0', capacity: '1' }], service: '200' });
    const withWarmup = buildEngine(m, 1, 150, 400, null, 5000, 5000, true).runAll().summary.perResource.Doctor;
    const noWarmup = buildEngine(m, 1, 0, 400, null, 5000, 5000, true).runAll().summary.perResource.Doctor;
    // Busy until the release at t=200, measured to that moment.
    expect(noWarmup.maxSustainedHighUtil).toBe(200);
    expect(withWarmup.maxSustainedHighUtil).toBe(50);
    // Idle from t=200 to the end of the run at t=400.
    expect(noWarmup.maxSustainedZeroUtil).toBe(200);
  });
});
