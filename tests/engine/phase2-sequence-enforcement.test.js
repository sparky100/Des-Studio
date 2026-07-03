// tests/engine/phase2-sequence-enforcement.test.js — Phase 2, item 2c: service
// sequence enforcement. An entity type's `requiredSequence` declares the
// queues it should visit in order; validation rule V68 flags routing that
// jumps backward through the declared stages. Design-time only — the engine
// does not enforce this at run time, so no engine/runAll tests are needed
// here, only validateModel(model) assertions.

import { describe, test, expect } from 'vitest';
import { validateModel } from '../../src/engine/validation.js';

function baseModel({ requiredSequence, secondStageDestination = 'DischargeQueue' } = {}) {
  return {
    entityTypes: [
      {
        id: 'et-patient', name: 'Patient', role: 'customer', attrDefs: [],
        ...(requiredSequence ? { requiredSequence } : {}),
      },
      { id: 'et-staff', name: 'Staff', role: 'server', count: 3, attrDefs: [] },
    ],
    queues: [
      { id: 'q-triage', name: 'TriageQueue', customerType: 'Patient', discipline: 'FIFO' },
      { id: 'q-treatment', name: 'TreatmentQueue', customerType: 'Patient', discipline: 'FIFO' },
      { id: 'q-discharge', name: 'DischargeQueue', customerType: 'Patient', discipline: 'FIFO' },
    ],
    stateVariables: [],
    bEvents: [
      { id: 'b1', name: 'TriageDone', scheduledTime: '9999', effect: 'RELEASE(Staff, TreatmentQueue)', schedules: [] },
      { id: 'b2', name: 'TreatmentDone', scheduledTime: '9999', effect: `RELEASE(Staff, ${secondStageDestination})`, schedules: [] },
    ],
    cEvents: [
      {
        id: 'c1', name: 'StartTriage', priority: 1,
        condition: 'queue(TriageQueue).length > 0 AND idle(Staff).count > 0',
        effect: 'ASSIGN(TriageQueue, Staff)',
        cSchedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
      },
      {
        id: 'c2', name: 'StartTreatment', priority: 2,
        condition: 'queue(TreatmentQueue).length > 0 AND idle(Staff).count > 0',
        effect: 'ASSIGN(TreatmentQueue, Staff)',
        cSchedules: [{ eventId: 'b2', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
      },
      {
        id: 'c3', name: 'Discharge', priority: 3,
        condition: 'queue(DischargeQueue).length > 0',
        effect: 'COMPLETE()',
      },
    ],
  };
}

describe('V68 — service sequence enforcement', () => {
  test('produces no V68 activity when no entity type declares requiredSequence', () => {
    const { errors, warnings } = validateModel(baseModel());
    expect(errors.some(e => e.code === 'V68')).toBe(false);
    expect(warnings.some(w => w.code === 'V68')).toBe(false);
  });

  test('produces no warning when routing only ever moves forward through the sequence', () => {
    const model = baseModel({ requiredSequence: ['TriageQueue', 'TreatmentQueue', 'DischargeQueue'] });
    const { errors, warnings } = validateModel(model);
    expect(errors.some(e => e.code === 'V68')).toBe(false);
    expect(warnings.some(w => w.code === 'V68')).toBe(false);
  });

  test('flags a backward routing edge through the declared stages', () => {
    const model = baseModel({
      requiredSequence: ['TriageQueue', 'TreatmentQueue', 'DischargeQueue'],
      secondStageDestination: 'TriageQueue',
    });
    const { warnings } = validateModel(model);
    const hit = warnings.find(w => w.code === 'V68');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/TreatmentQueue.*backward.*TriageQueue/);
  });

  test('does not report the backward edge as a blocking error', () => {
    const model = baseModel({
      requiredSequence: ['TriageQueue', 'TreatmentQueue', 'DischargeQueue'],
      secondStageDestination: 'TriageQueue',
    });
    const { errors } = validateModel(model);
    expect(errors.some(e => e.code === 'V68')).toBe(false);
  });

  test('flags a requiredSequence entry that does not match any declared queue', () => {
    const model = baseModel({ requiredSequence: ['TriageQueue', 'TreetmentQueue', 'DischargeQueue'] });
    const { errors } = validateModel(model);
    const hit = errors.find(e => e.code === 'V68');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/TreetmentQueue/);
    expect(hit.message).toMatch(/does not match any defined queue/);
  });

  test('does not warn twice for the same backward edge', () => {
    const model = baseModel({
      requiredSequence: ['TriageQueue', 'TreatmentQueue', 'DischargeQueue'],
      secondStageDestination: 'TriageQueue',
    });
    const { warnings } = validateModel(model);
    expect(warnings.filter(w => w.code === 'V68').length).toBe(1);
  });
});
