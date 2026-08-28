// Sprint 96 — FAIL/REPAIR quantities: "FAIL(Type, N)" and "REPAIR(Type, N)" let
// a B-event take down or restore exactly N servers of a type instead of all of
// them (e.g. "1 of 5 CT scanners breaks"), closing another Group B gap from
// docs/reviews/macro-library-ui-coverage-audit.md. FAIL prefers idle servers
// before touching busy ones (least disruptive); REPAIR prefers the
// longest-failed servers first. Omitting N keeps today's "all" behavior.
import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

describe('FAIL/REPAIR quantities (Type, N)', () => {
  test('FAIL(Type, N) prefers idle servers and leaves busy servers untouched when idle count suffices', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
        { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
        { id: "fail_it", name: "Fail one Nurse", scheduledTime: "5", effect: "FAIL(Nurse, 1)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_assign", name: "Assign Nurse", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0",
          effect: "ASSIGN(TriageQueue, Nurse)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "50" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    expect(nurses.filter(e => e.status === "failed")).toHaveLength(1);
    expect(nurses.filter(e => e.status === "idle")).toHaveLength(1);
    expect(nurses.filter(e => e.status === "busy")).toHaveLength(1);

    // The busy Nurse's patient must never have been preempted/re-queued.
    const preemptLogs = result.log.filter(e => e.message?.includes("re-queued"));
    expect(preemptLogs.length).toBe(0);
  });

  test('FAIL(Type, N) preempts a busy server only once idle capacity is exhausted', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
        { id: "fail_it", name: "Fail one Nurse", scheduledTime: "3", effect: "FAIL(Nurse, 1)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_assign", name: "Assign Nurse", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0",
          effect: "ASSIGN(TriageQueue, Nurse)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "50" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    // Both Nurses should be busy by t=3 (two patients arrived at t=0 and t=1),
    // so the FAIL(Nurse, 1) at t=3 has no idle Nurse to prefer and must
    // preempt a busy one.
    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    expect(nurses.filter(e => e.status === "failed")).toHaveLength(1);

    const preemptLogs = result.log.filter(e =>
      e.message?.includes("FAIL:") && e.message?.includes("re-queued")
    );
    expect(preemptLogs.length).toBeGreaterThan(0);
  });

  test('FAIL(Type, N) fails all available and notes the shortfall when N exceeds the server count', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "fail_it", name: "Fail Nurses", scheduledTime: "1", effect: "FAIL(Nurse, 5)", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 42, 0, 5);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    expect(nurses.every(e => e.status === "failed")).toBe(true);

    const shortfallLog = result.log.find(e =>
      e.message?.includes("FAIL: 2 Nurse") && e.message?.includes("requested 5, only 2 available")
    );
    expect(shortfallLog).toBeDefined();
  });

  test('FAIL(Type) with no N still fails every server of the type, idle and busy alike (regression)', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
        { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
        { id: "fail_it", name: "Fail all Nurses", scheduledTime: "5", effect: "FAIL(Nurse)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_assign", name: "Assign Nurse", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0",
          effect: "ASSIGN(TriageQueue, Nurse)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "50" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    expect(nurses.every(e => e.status === "failed")).toBe(true);
  });

  test('REPAIR(Type, N) repairs the longest-failed servers first', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        // Three one-at-a-time FAILs, each catching the next still-idle Nurse,
        // so the three Nurses fail at three distinct, known times.
        { id: "fail1", name: "Fail #1", scheduledTime: "1", effect: "FAIL(Nurse, 1)", schedules: [] },
        { id: "fail2", name: "Fail #2", scheduledTime: "3", effect: "FAIL(Nurse, 1)", schedules: [] },
        { id: "fail3", name: "Fail #3", scheduledTime: "5", effect: "FAIL(Nurse, 1)", schedules: [] },
        { id: "repair_it", name: "Repair two", scheduledTime: "10", effect: "REPAIR(Nurse, 2)", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 42, 0, 15);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    const idleNurses = nurses.filter(e => e.status === "idle");
    const failedNurses = nurses.filter(e => e.status === "failed");
    expect(idleNurses).toHaveLength(2);
    expect(failedNurses).toHaveLength(1);

    // The one still failed must be the one that failed LAST (t=5) — the two
    // oldest failures (t=1, t=3) were repaired first.
    expect(failedNurses[0]._failedAt).toBe(5);
  });

  test('REPAIR(Type, N) repairs all failed and notes the shortfall when N exceeds the failed count', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "fail_it", name: "Fail Nurses", scheduledTime: "1", effect: "FAIL(Nurse)", schedules: [] },
        { id: "repair_it", name: "Repair Nurses", scheduledTime: "5", effect: "REPAIR(Nurse, 5)", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    expect(nurses.every(e => e.status === "idle")).toBe(true);

    const shortfallLog = result.log.find(e =>
      e.message?.includes("REPAIR: 2 Nurse") && e.message?.includes("requested 5, only 2 failed")
    );
    expect(shortfallLog).toBeDefined();
  });

  test('REPAIR(Type) with no N still repairs every failed server of the type (regression)', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "fail_it", name: "Fail Nurses", scheduledTime: "1", effect: "FAIL(Nurse)", schedules: [] },
        { id: "repair_it", name: "Repair Nurses", scheduledTime: "5", effect: "REPAIR(Nurse)", schedules: [] },
      ],
      cEvents: [],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    expect(nurses.every(e => e.status === "idle")).toBe(true);
  });
});
