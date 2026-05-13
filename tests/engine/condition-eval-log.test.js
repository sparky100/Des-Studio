import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// buildEngine positional signature:
// (model, seed, warmupPeriod, maxSimTime, terminationCondition, maxCycles, maxCPasses, collectTimeSeries, debugMode)
const DBG = (model, seed = 42, maxCycles = 5000) =>
  buildEngine(model, seed, 0, null, null, maxCycles, 500, false, true);

// Minimal model: one no-op B-event triggers one A→B→C cycle, then FEL is empty.
function noArrivalModel(cEvents = [], entityTypes = []) {
  return {
    entityTypes,
    stateVariables: [],
    bEvents: [{ id: 'b1', name: 'Init', scheduledTime: '0', effect: '', schedules: [] }],
    cEvents,
  };
}

describe('conditionEvalLog — F27R.1', () => {

  // ── Test 1 ────────────────────────────────────────────────────────────────
  test('records emitted when debugMode true: false outcome, variableSnapshot populated', () => {
    const model = noArrivalModel([
      { id: 'c1', name: 'Assign', condition: 'queue(Customer).length > 0', effect: '' },
    ]);
    const result = DBG(model).runAll();

    expect(result.conditionEvalLog.length).toBeGreaterThan(0);
    const rec = result.conditionEvalLog[0];

    expect(rec.outcome).toBe(false);
    expect(rec.cEventName).toBe('Assign');
    expect(rec.cEventPriority).toBe(9999);               // no priority set → default
    expect(rec.conditionExpr).toBe('queue(Customer).length > 0');
    expect(rec.t).toBe(0);
    expect(rec.variableSnapshot['queue(Customer).length']).toBe(0);
    expect(rec.failingOperand).toBeTruthy();
    expect(rec.failingOperand).toContain('queue(Customer).length');
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────
  test('records emitted on true outcome: failingOperand is null', () => {
    const model = {
      entityTypes: [
        { id: 'et1', name: 'Customer', role: 'customer', count: '', attrDefs: [] },
        { id: 'et2', name: 'Server',   role: 'server',   count: '1', attrDefs: [] },
      ],
      stateVariables: [],
      bEvents: [
        { id: 'b1', name: 'Arrive',   scheduledTime: '0',   effect: 'ARRIVE(Customer)', schedules: [] },
        { id: 'b2', name: 'Complete', scheduledTime: '999', effect: 'COMPLETE()',        schedules: [] },
      ],
      cEvents: [
        {
          id: 'c1', name: 'Start Service',
          condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
          effect: 'ASSIGN(Customer, Server)',
          cSchedules: [{ id: 'cs1', eventId: 'b2', dist: 'Fixed', distParams: { value: '5' }, useEntityCtx: true }],
        },
      ],
    };
    const result = DBG(model).runAll();

    const trueRec = result.conditionEvalLog.find(r => r.outcome === true);
    expect(trueRec).toBeDefined();
    expect(trueRec.failingOperand).toBeNull();
    expect(trueRec.cEventName).toBe('Start Service');
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────
  test('AND predicate: failingOperand names the first false clause only', () => {
    // No customers → clause 1 (queue) fails.  1 idle server → clause 2 is true.
    const model = noArrivalModel(
      [{ id: 'c1', name: 'Assign',
         condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
         effect: '' }],
      [{ id: 'et2', name: 'Server', role: 'server', count: '1', attrDefs: [] }]
    );
    const result = DBG(model).runAll();

    const rec = result.conditionEvalLog[0];
    expect(rec.outcome).toBe(false);
    expect(rec.failingOperand).toContain('queue(Customer).length');
    expect(rec.failingOperand).not.toContain('idle(Server)');
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  test('no records produced when debugMode is false (default)', () => {
    const model = noArrivalModel([
      { id: 'c1', name: 'Assign', condition: 'queue(Customer).length > 0', effect: '' },
    ]);
    // debugMode defaults to false
    const result = buildEngine(model, 42).runAll();

    expect(result.conditionEvalLog.length).toBe(0);
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────
  test('cap: log truncates at 10,000 and sets conditionEvalLogTruncated', () => {
    // 3 always-false C-events × 4 000 B-event steps = 12 000 evals → cap at 10 000.
    const model = {
      entityTypes: [],
      stateVariables: [],
      bEvents: [{
        id: 'b1', name: 'Tick', scheduledTime: '0', effect: '',
        schedules: [{ eventId: 'b1', dist: 'Fixed', distParams: { value: '1' }, isRenege: false }],
      }],
      cEvents: [
        { id: 'c1', name: 'Never1', condition: 'queue(Ghost).length > 0', effect: '' },
        { id: 'c2', name: 'Never2', condition: 'queue(Ghost).length > 1', effect: '' },
        { id: 'c3', name: 'Never3', condition: 'queue(Ghost).length > 2', effect: '' },
      ],
    };
    const result = DBG(model, 42, 4000).runAll();

    expect(result.conditionEvalLog.length).toBe(10_000);
    expect(result.conditionEvalLogTruncated).toBe(true);
  });

  // ── Test 6 ────────────────────────────────────────────────────────────────
  test('variableSnapshot captures the actual queue length at evaluation time', () => {
    // One patient arrives at t=0, then C-event checks queue > 5 (false).
    // Snapshot must record the actual queue length of 1.
    const model = {
      entityTypes: [
        { id: 'et1', name: 'Patient', role: 'customer', count: '', attrDefs: [] },
      ],
      stateVariables: [],
      bEvents: [
        { id: 'b1', name: 'Patient Arrives', scheduledTime: '0', effect: 'ARRIVE(Patient)', schedules: [] },
      ],
      cEvents: [
        { id: 'c1', name: 'Check Queue', condition: 'queue(Patient).length > 5', effect: '' },
      ],
    };
    const result = DBG(model).runAll();

    const rec = result.conditionEvalLog.find(r => r.cEventName === 'Check Queue');
    expect(rec).toBeDefined();
    expect(rec.variableSnapshot['queue(Patient).length']).toBe(1);
    expect(rec.outcome).toBe(false);
    expect(rec.failingOperand).toContain('queue(Patient).length');
    expect(rec.failingOperand).toContain('1');
  });

});
