import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal model with no entities or arrivals — just scalar state and C-events.
// A single no-op B-event at t=0 triggers one Phase A→B→C cycle, then the FEL
// is empty and the engine terminates. C-events fire during that single cycle.
function makeScalarModel({ stateVariables = [], cEvents = [] } = {}) {
  return {
    entityTypes:    [],
    stateVariables,
    bEvents: [
      { id: 'b_init', name: 'Init', scheduledTime: '0', effect: '', schedules: [] },
    ],
    cEvents,
  };
}

// ── Phase A — Clock advance ───────────────────────────────────────────────────

describe('Phase A', () => {
  test('advances clock to the scheduled time of the next FEL event', () => {
    const model = makeScalarModel();
    model.bEvents = [
      { id: 'b1', name: 'First', scheduledTime: '5', effect: '', schedules: [] },
    ];
    const engine = buildEngine(model);
    engine.step();
    expect(engine.getSnap().clock).toBe(5);
  });

  test('advances to the earliest event when FEL has multiple events', () => {
    const model = makeScalarModel();
    model.bEvents = [
      { id: 'b1', name: 'Late',  scheduledTime: '10', effect: '', schedules: [] },
      { id: 'b2', name: 'Early', scheduledTime: '3',  effect: '', schedules: [] },
    ];
    const engine = buildEngine(model);
    engine.step();
    expect(engine.getSnap().clock).toBe(3);
  });
});

// ── Phase B — All events at T_now fire before Phase C ────────────────────────

describe('Phase B', () => {
  test('fires all B-events at the same scheduled time in one pass', () => {
    // Two state vars, one incremented by each B-event at t=0.
    const model = makeScalarModel({
      stateVariables: [
        { id: 'sv1', name: 'countX', initialValue: '0' },
        { id: 'sv2', name: 'countY', initialValue: '0' },
      ],
    });
    model.bEvents = [
      { id: 'b1', name: 'IncX', scheduledTime: '0', effect: 'countX++', schedules: [] },
      { id: 'b2', name: 'IncY', scheduledTime: '0', effect: 'countY++', schedules: [] },
    ];
    const result = buildEngine(model).runAll();
    expect(result.snap.scalars.countX).toBe(1);
    expect(result.snap.scalars.countY).toBe(1);
  });
});

// ── FEL termination ───────────────────────────────────────────────────────────

describe('Engine termination', () => {
  test('terminates when FEL is empty', () => {
    const model = makeScalarModel();
    const engine = buildEngine(model);
    const result = engine.runAll();
    expect(engine.getFelSize()).toBe(0);
    expect(result.log.some(e => e.phase === 'END')).toBe(true);
  });
});

// ── Phase C — C-scan restart rule (the critical test) ────────────────────────

describe('Phase C — C-scan restart rule', () => {

  // ── Test fixture ─────────────────────────────────────────────────────────────
  // Three C-Events ordered [P1, P2, P3] — array position = priority (lower = higher).
  //
  // Initial state: a=0, b=0, trigger=0
  //
  // P1 (highest, index 0): fires when trigger>0 AND a==0 → sets a=1, trigger=0
  // P2 (middle,  index 1): fires when a==0 AND b==0 AND trigger==0 → sets trigger=1
  // P3 (lowest,  index 2): fires when trigger>0 AND b==0 → sets b=1, trigger=0
  //
  // Sequence:
  //   P2 fires first (only event whose condition is true at t=0).
  //   This makes both P1 (trigger>0, a==0) and P3 (trigger>0, b==0) true.
  //
  // CORRECT restart behaviour (with break):
  //   P2 fires → BREAK → restart from P1 → P1 fires (a=1, trigger=0) → BREAK
  //   → restart → P2 false (a=1) → P3 false (trigger=0) → stable.
  //   Final: a=1, b=0.
  //
  // BROKEN no-restart behaviour (without break, current code):
  //   P2 fires → continue for-loop → P3 fires (b=1, trigger=0) — P1 is already past.
  //   Next pass: P1 condition false (trigger=0) → stable.
  //   Final: a=0, b=1  ← priority inversion.

  const restartModel = makeScalarModel({
    stateVariables: [
      { id: 'sv1', name: 'a',       initialValue: '0' },
      { id: 'sv2', name: 'b',       initialValue: '0' },
      { id: 'sv3', name: 'trigger', initialValue: '0' },
    ],
    cEvents: [
      {
        id: 'c1', name: 'P1-HighPriority', priority: 1,
        condition: 'trigger > 0 AND a == 0',
        effect:    'a = 1; trigger = 0',
        cSchedules: [],
      },
      {
        id: 'c2', name: 'P2-MidPriority', priority: 2,
        condition: 'a == 0 AND b == 0 AND trigger == 0',
        effect:    'trigger = 1',
        cSchedules: [],
      },
      {
        id: 'c3', name: 'P3-LowPriority', priority: 3,
        condition: 'trigger > 0 AND b == 0',
        effect:    'b = 1; trigger = 0',
        cSchedules: [],
      },
    ],
  });

  test('C-scan restarts from Priority 1 when any C-event fires', () => {
    const result = buildEngine(restartModel).runAll();
    const { a, b, trigger } = result.snap.scalars;

    // P1 must have claimed the trigger (a=1).
    // P3 must NOT have fired because P1 restarted first and consumed the trigger.
    expect(a).toBe(1);
    expect(b).toBe(0);
    expect(trigger).toBe(0);
  });

  test('firing order recorded in log: P2 then P1 (not P2 then P3)', () => {
    const result = buildEngine(restartModel).runAll();
    const cLog = result.log
      .filter(e => e.phase === 'C')
      .map(e => e.message.match(/^C: "([^"]+)"/)?.[1]);

    // P2 must appear before P1, and P3 must never appear
    const p1Idx = cLog.indexOf('P1-HighPriority');
    const p2Idx = cLog.indexOf('P2-MidPriority');
    const p3Idx = cLog.indexOf('P3-LowPriority');

    expect(p2Idx).toBeGreaterThanOrEqual(0); // P2 fired
    expect(p1Idx).toBeGreaterThan(p2Idx);    // P1 fired after P2 (on restart)
    expect(p3Idx).toBe(-1);                  // P3 never fired
  });

  test('Phase C scan is stable once no condition is true', () => {
    // A model whose single C-event fires exactly once then its condition becomes false.
    const model = makeScalarModel({
      stateVariables: [{ id: 'sv1', name: 'done', initialValue: '0' }],
      cEvents: [
        {
          id: 'c1', name: 'OnceOnly',
          condition: 'done == 0',
          effect: 'done = 1',
          cSchedules: [],
        },
      ],
    });
    const result = buildEngine(model).runAll();
    expect(result.snap.scalars.done).toBe(1);
    // Verify the C-event fired exactly once
    const cFires = result.log.filter(e => e.phase === 'C' && e.message.includes('OnceOnly'));
    expect(cFires).toHaveLength(1);
  });
});
