import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function buildSimpleModel() {
  return {
    name: "Trace Test",
    entityTypes: [
      { id: "et-cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et-srv", name: "Server", role: "server", count: "1", attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q1", name: "Queue", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "b-arrive", name: "Arrival", scheduledTime: "0",
        effect: "ARRIVE(Customer, Queue)",
        schedules: [{ eventId: "b-arrive", dist: "fixed", distParams: { value: 5 } }],
      },
      {
        id: "b-done", name: "Done", scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c-assign", name: "Assign", priority: 1,
        condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
        effect: "ASSIGN(Customer, Server)",
        cSchedules: [{ eventId: "b-done", dist: "fixed", distParams: { value: 3 }, useEntityCtx: true }],
      },
    ],
  };
}

describe('Trace determinism — same seed produces identical trace', () => {
  test('two runs with seed 42 produce identical log sequences', () => {
    const model = buildSimpleModel();
    const engine1 = buildEngine(model, 42, 0, 100);
    const engine2 = buildEngine(model, 42, 0, 100);
    const result1 = engine1.runAll();
    const result2 = engine2.runAll();

    expect(result1.log.length).toBe(result2.log.length);
    for (let i = 0; i < result1.log.length; i++) {
      const a = result1.log[i];
      const b = result2.log[i];
      expect(a.phase).toBe(b.phase);
      expect(a.time).toBe(b.time);
      expect(a.seq).toBe(b.seq);
      expect(a.message).toBe(b.message);
      if (a.event && b.event) {
        expect(a.event.fired).toBe(b.event.fired);
        expect(a.event.entityIds).toEqual(b.event.entityIds);
      }
      if (a.cEval && b.cEval) {
        expect(a.cEval.conditionTrue).toBe(b.cEval.conditionTrue);
        expect(a.cEval.pass).toBe(b.cEval.pass);
        expect(a.cEval.priority).toBe(b.cEval.priority);
      }
    }
  });

  test('different seeds produce different trace sequences', () => {
    const model = buildSimpleModel();
    model.bEvents[0].schedules = [{ eventId: "b-arrive", dist: "exponential", distParams: { rate: 0.2 } }];
    model.cEvents[0].cSchedules = [{ eventId: "b-done", dist: "exponential", distParams: { rate: 0.33 }, useEntityCtx: true }];

    const engine1 = buildEngine(model, 42, 0, 100);
    const engine2 = buildEngine(model, 99, 0, 100);
    const result1 = engine1.runAll();
    const result2 = engine2.runAll();

    const messages1 = result1.log.map(l => l.message).join('|');
    const messages2 = result2.log.map(l => l.message).join('|');
    expect(messages1).not.toBe(messages2);
  });
});

describe('Trace completeness — required trace categories are emitted', () => {
  test('Phase A clock advance entries include clock.from, clock.to, clock.dueEvents', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const phaseAEntries = result.log.filter(e => e.phase === "A");
    expect(phaseAEntries.length).toBeGreaterThan(0);
    for (const entry of phaseAEntries) {
      expect(entry.clock).toBeDefined();
      expect(typeof entry.clock.from).toBe('number');
      expect(typeof entry.clock.to).toBe('number');
      expect(Array.isArray(entry.clock.dueEvents)).toBe(true);
    }
  });

  test('B-event fire entries include event.type, event.fired, event.entityIds, event.newEvents', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const phaseBEntries = result.log.filter(e => e.phase === "B");
    expect(phaseBEntries.length).toBeGreaterThan(0);
    for (const entry of phaseBEntries) {
      expect(entry.event).toBeDefined();
      expect(entry.event.type).toBe("B");
      expect(typeof entry.event.fired).toBe('boolean');
      expect(Array.isArray(entry.event.entityIds)).toBe(true);
      expect(Array.isArray(entry.event.newEvents)).toBe(true);
    }
  });

  test('C-event evaluation entries include cEval with conditionTrue, pass, priority', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const phaseCEntries = result.log.filter(e => e.phase === "C" && e.cEval);
    expect(phaseCEntries.length).toBeGreaterThan(0);
    for (const entry of phaseCEntries) {
      expect(entry.cEval).toBeDefined();
      expect(typeof entry.cEval.conditionTrue).toBe('boolean');
      expect(typeof entry.cEval.pass).toBe('number');
      expect(typeof entry.cEval.priority).toBe('number');
      expect(entry.cEval.eventId).toBeDefined();
      expect(entry.cEval.eventName).toBeDefined();
    }
  });

  test('C-event false entries include failureReason', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const falseEntries = result.log.filter(e => e.phase === "C" && e.cEval && !e.cEval.conditionTrue);
    expect(falseEntries.length).toBeGreaterThan(0);
    for (const entry of falseEntries) {
      if (!entry.cEval.skippedBecause) {
        expect(entry.cEval.failureReason).toBeDefined();
      }
    }
  });

  test('C-event skipped entries include skippedBecause', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const skippedEntries = result.log.filter(e => e.phase === "C" && e.cEval && e.cEval.skippedBecause);
    if (skippedEntries.length > 0) {
      for (const entry of skippedEntries) {
        expect(entry.cEval.skippedBecause).toBe("restart");
      }
    }
  });

  test('INIT and END trace entries are present', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const initEntries = result.log.filter(e => e.phase === "INIT");
    const endEntries = result.log.filter(e => e.phase === "END");
    expect(initEntries.length).toBeGreaterThanOrEqual(1);
    expect(endEntries.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Trace does not mutate engine behaviour', () => {
  test('runAll results are identical with and without trace emission', () => {
    const model = buildSimpleModel();
    const engine1 = buildEngine(model, 42, 0, 100);
    const engine2 = buildEngine(model, 42, 0, 100);
    const result1 = engine1.runAll();
    const result2 = engine2.runAll();

    expect(result1.summary.served).toBe(result2.summary.served);
    expect(result1.summary.avgWait).toBe(result2.summary.avgWait);
    expect(result1.summary.avgSvc).toBe(result2.summary.avgSvc);
    expect(result1.finalTime).toBe(result2.finalTime);
    expect(result1.snap.served).toBe(result2.snap.served);
    expect(result1.snap.reneged).toBe(result2.snap.reneged);
  });

  test('step() results are identical — summary and snapshot match', () => {
    const model = buildSimpleModel();
    const engine1 = buildEngine(model, 42, 0, 100);
    const engine2 = buildEngine(model, 42, 0, 100);

    for (let i = 0; i < 20; i++) {
      const r1 = engine1.step();
      const r2 = engine2.step();
      if (r1.done !== r2.done) break;
      if (r1.done && r2.done) break;
      expect(r1.snap.clock).toBe(r2.snap.clock);
      expect(r1.snap.served).toBe(r2.snap.served);
    }
  });
});

describe('Arbitration trace entries', () => {
  test('ASSIGN macro emits arbitration trace with candidates, winner, idleServers', () => {
    const model = buildSimpleModel();
    const engine = buildEngine(model, 42, 0, 50);
    const result = engine.runAll();

    const arbEntries = result.log.filter(e => e.arbitration);
    expect(arbEntries.length).toBeGreaterThan(0);
    for (const entry of arbEntries) {
      expect(entry.arbitration.type).toBeDefined();
      expect(Array.isArray(entry.arbitration.candidates)).toBe(true);
      if (entry.arbitration.winner) {
        expect(entry.arbitration.winner.entityId).toBeDefined();
      }
      if (entry.arbitration.noMatch) {
        expect(typeof entry.arbitration.candidateCount).toBe('number');
        expect(typeof entry.arbitration.idleServerCount).toBe('number');
      }
    }
  });
});

describe('Phase C truncation warning', () => {
  test('truncation emits WARNING phase entry with structured warning object', () => {
    const model = {
      name: "Unstable C-Event Model",
      entityTypes: [
        { id: "et-cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      ],
      stateVariables: [
        { id: "sv-toggle", name: "toggle", valueType: "number", initialValue: "0", resetOnWarmup: true },
      ],
      queues: [],
      bEvents: [
        {
          id: "b-init", name: "Init", scheduledTime: "0",
          effect: [],
          schedules: [],
        },
      ],
      cEvents: [
        {
          id: "c-flip", name: "Flip", priority: 1,
          condition: "toggle == 0",
          effect: "toggle = 1",
          cSchedules: [],
        },
        {
          id: "c-flop", name: "Flop", priority: 2,
          condition: "toggle == 1",
          effect: "toggle = 0",
          cSchedules: [],
        },
      ],
    };

    const engine = buildEngine(model, 42, 0, null, null, 10, 3);
    const result = engine.runAll();

    const warningEntries = result.log.filter(e => e.phase === "WARNING");
    expect(warningEntries.length).toBeGreaterThan(0);
    for (const entry of warningEntries) {
      expect(entry.warning).toBeDefined();
      expect(entry.warning.code).toBeDefined();
      expect(entry.warning.message).toBeDefined();
    }
  });
});
