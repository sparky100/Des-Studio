// Sprint 97 — PREEMPT/FINISH victim selection: an optional criterion argument
// (PRIORITY(attrName), LONGEST, SHORTEST) lets these macros target a specific
// in-service entity instead of always acting on the first busy server of a
// type, closing another Group B gap from
// docs/reviews/macro-library-ui-coverage-audit.md. Omitting the criterion
// keeps today's "first busy server" behavior unchanged.
import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

// Three patient types staggered so priority order, arrival/serviceStart
// order, and the expected pick under each criterion are all mutually
// distinct — proves each criterion ranks independently, not by coincidence:
//   PatientA: arrives t=0 (longest elapsed by the time PREEMPT/FINISH fires), priority=3
//   PatientB: arrives t=1 (middle),                                          priority=1 (lowest)
//   PatientC: arrives t=2 (shortest elapsed),                                priority=5
// So: PRIORITY(priority) -> PatientB, LONGEST -> PatientA, SHORTEST -> PatientC.
function threePatientModel(actionEffect, actionTime) {
  return {
    entityTypes: [
      { id: "pa", name: "PatientA", role: "customer", attrDefs: [{ name: "priority", dist: "Fixed", distParams: { value: "3" } }] },
      { id: "pb", name: "PatientB", role: "customer", attrDefs: [{ name: "priority", dist: "Fixed", distParams: { value: "1" } }] },
      { id: "pc", name: "PatientC", role: "customer", attrDefs: [{ name: "priority", dist: "Fixed", distParams: { value: "5" } }] },
      { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [{ id: "q", name: "Queue", discipline: "FIFO" }],
    bEvents: [
      { id: "arriveA", name: "A Arrival", scheduledTime: "0", effect: "ARRIVE(PatientA, Queue)", schedules: [] },
      { id: "arriveB", name: "B Arrival", scheduledTime: "1", effect: "ARRIVE(PatientB, Queue)", schedules: [] },
      { id: "arriveC", name: "C Arrival", scheduledTime: "2", effect: "ARRIVE(PatientC, Queue)", schedules: [] },
      { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      { id: "act", name: "Action", scheduledTime: String(actionTime), effect: actionEffect, schedules: [] },
    ],
    cEvents: [
      { id: "ce_assign", name: "Assign Nurse", priority: 1,
        condition: "queue(Queue).length > 0 AND idle(Nurse).count > 0",
        effect: "ASSIGN(Queue, Nurse)",
        cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "100" }, useEntityCtx: true }] },
    ],
  };
}

describe('PREEMPT victim selection', () => {
  test('PREEMPT(Type) with no criterion preempts exactly one busy server (regression)', () => {
    // The freed Nurse immediately re-seizes the re-queued patient (nothing
    // else is waiting), so end-of-run status has recovered to "busy"/"serving"
    // by design — assert on the preemption log evidence instead of final state.
    const model = threePatientModel("PREEMPT(Nurse)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const preemptLogs = result.log.filter(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    expect(preemptLogs).toHaveLength(1);
  });

  test('PREEMPT(Type, PRIORITY(priority)) targets the lowest-priority in-service entity', () => {
    const model = threePatientModel("PREEMPT(Nurse, PRIORITY(priority))", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const preemptLog = result.log.find(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    expect(preemptLog).toBeDefined();
    const patientB = result.entitySummary.find(e => e.type === "PatientB");
    expect(preemptLog.message).toContain(`#${patientB.id}`);
  });

  test('PREEMPT(Type, PRIORITY(priority)) tiebreak: equal priority resolves to the earlier serviceStart', () => {
    const model = threePatientModel("PREEMPT(Nurse, PRIORITY(priority))", 5);
    // Give A and B the same (lowest) priority; A started service first (t=0).
    model.entityTypes[0].attrDefs[0].distParams.value = "1"; // PatientA priority=1
    model.entityTypes[1].attrDefs[0].distParams.value = "1"; // PatientB priority=1 (tie)
    model.entityTypes[2].attrDefs[0].distParams.value = "9"; // PatientC priority=9

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const preemptLog = result.log.find(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    const patientA = result.entitySummary.find(e => e.type === "PatientA");
    expect(preemptLog.message).toContain(`#${patientA.id}`);
  });

  test('PREEMPT(Type, LONGEST) targets the entity in service the longest', () => {
    const model = threePatientModel("PREEMPT(Nurse, LONGEST)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const preemptLog = result.log.find(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    const patientA = result.entitySummary.find(e => e.type === "PatientA");
    expect(preemptLog.message).toContain(`#${patientA.id}`);
  });

  test('PREEMPT(Type, SHORTEST) targets the entity in service the shortest time', () => {
    const model = threePatientModel("PREEMPT(Nurse, SHORTEST)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const preemptLog = result.log.find(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    const patientC = result.entitySummary.find(e => e.type === "PatientC");
    expect(preemptLog.message).toContain(`#${patientC.id}`);
  });

  test('PREEMPT(Type, unrecognized criterion) falls back to the first busy server with a warning logged', () => {
    const model = threePatientModel("PREEMPT(Nurse, NOT_A_REAL_CRITERION)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const preemptLogs = result.log.filter(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    expect(preemptLogs).toHaveLength(1);

    const warning = result.log.find(e =>
      e.message?.includes("unrecognized selection criterion") && e.message?.includes("NOT_A_REAL_CRITERION")
    );
    expect(warning).toBeDefined();
  });
});

describe('FINISH victim selection', () => {
  test('FINISH(Type) with no criterion finishes exactly one busy server (regression)', () => {
    const model = threePatientModel("FINISH(Nurse)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const done = result.entitySummary.filter(e => e.role === "customer" && e.status === "done");
    expect(done).toHaveLength(1);
  });

  test('FINISH(Type, PRIORITY(priority)) targets the lowest-priority in-service entity', () => {
    const model = threePatientModel("FINISH(Nurse, PRIORITY(priority))", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const patientB = result.entitySummary.find(e => e.type === "PatientB");
    expect(patientB.status).toBe("done");
  });

  test('FINISH(Type, LONGEST) targets the entity in service the longest', () => {
    const model = threePatientModel("FINISH(Nurse, LONGEST)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const patientA = result.entitySummary.find(e => e.type === "PatientA");
    expect(patientA.status).toBe("done");
  });

  test('FINISH(Type, SHORTEST) targets the entity in service the shortest time', () => {
    const model = threePatientModel("FINISH(Nurse, SHORTEST)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const patientC = result.entitySummary.find(e => e.type === "PatientC");
    expect(patientC.status).toBe("done");
  });

  test('FINISH(Type, unrecognized criterion) falls back to the first busy server with a warning logged', () => {
    const model = threePatientModel("FINISH(Nurse, NOT_A_REAL_CRITERION)", 5);
    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const done = result.entitySummary.filter(e => e.role === "customer" && e.status === "done");
    expect(done).toHaveLength(1);

    const warning = result.log.find(e =>
      e.message?.includes("unrecognized selection criterion") && e.message?.includes("NOT_A_REAL_CRITERION")
    );
    expect(warning).toBeDefined();
  });
});
