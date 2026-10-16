// Starvation = server-time spent idle while a queue the server type serves
// (through a plain ASSIGN) has work waiting — not plain idle time.
import { describe, expect, it } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';
import { TEMPLATES } from '../../src/engine/templates.js';

// One patient arrives at t=0, but a gate keeps the doctor from starting
// until t=50: the doctor is idle with work waiting for exactly 50.
function gatedModel({ gateOpensAt = '50', effect = 'ASSIGN(Q, Doctor)' } = {}) {
  return {
    entityTypes: [
      { id: 'p', name: 'Patient', role: 'customer', attrDefs: [] },
      { id: 'd', name: 'Doctor', role: 'server', count: 1, attrDefs: [] },
    ],
    stateVariables: [{ name: 'gate', initialValue: '0' }],
    queues: [{ id: 'q', name: 'Q', customerType: 'Patient' }],
    bEvents: [
      { id: 'a', name: 'Arr', scheduledTime: '0', effect: ['ARRIVE(Patient, Q)'], schedules: [] },
      { id: 'g', name: 'Open', scheduledTime: gateOpensAt, effect: ['SET(gate, 1)'], schedules: [] },
      { id: 'done', name: 'Done', scheduledTime: '1e12', effect: ['COMPLETE()'], schedules: [] },
    ],
    cEvents: [{ id: 'c', name: 'Consult', priority: 1, condition: 'queue(Q).length > 0 AND idle(Doctor).count > 0 AND gate == 1', effect: [effect],
      cSchedules: [{ eventId: 'done', dist: 'Fixed', distParams: { value: '10' }, useEntityCtx: true }] }],
  };
}

describe('starvation tracking', () => {
  it('counts idle time only while work is waiting', () => {
    const doc = buildEngine(gatedModel(), 1, 0, 100).runAll().summary.perResource.Doctor;
    // Idle 0–50 with a patient waiting (starved), busy 50–60, idle 60–100 with
    // nothing waiting (not starved).
    expect(doc.starvationTime).toBe(50);
    expect(doc.starvationPct).toBe(0.5);
    expect(doc.maxStarvationDuration).toBe(50);
  });

  it('measures from the end of warm-up', () => {
    const doc = buildEngine(gatedModel(), 1, 20, 100).runAll().summary.perResource.Doctor;
    expect(doc.starvationTime).toBe(30);
    expect(doc.maxStarvationDuration).toBe(30);
  });

  it('is not tracked for a type only served by a skill-filtered ASSIGN', () => {
    const doc = buildEngine(gatedModel({ effect: 'ASSIGN(Q, Doctor, "triage")' }), 1, 0, 100).runAll().summary.perResource.Doctor;
    expect(doc.starvationPct).toBeNull();
    expect(doc.maxStarvationDuration).toBeNull();
  });

  it('is ~0 for a plain M/M/1, where the server never idles with work waiting', () => {
    const mm1 = TEMPLATES.find(t => t.id === 'mm1');
    const server = buildEngine(mm1, 1, 0, 2000, null, 1e7, 1e7).runAll().summary.perResource.Server;
    expect(server.utilisation).toBeLessThan(0.97);
    expect(server.starvationPct).toBe(0);
    expect(server.maxStarvationDuration).toBeNull();
  });
});
