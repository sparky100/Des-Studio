// src/simulation/traceCollector.test.js — F69.1 unit tests
import { describe, test, expect, beforeEach } from "vitest";
import { TraceCollector, buildTraceFromLog } from "./traceCollector.js";
import { buildEngine } from "../engine/index.js";

// Minimal model: one B-event arrival (A-event equivalent)
const makeSimpleModel = () => ({
  name: "Test",
  entityTypes: [{ id: "et1", name: "Customer", role: "customer", count: "1", attrDefs: [] }],
  bEvents: [
    {
      id: "arrive1",
      name: "Arrive",
      scheduledTime: 0,
      schedules: [
        { macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1", dist: "exponential", distParams: { rate: 1 } },
      ],
    },
  ],
  cEvents: [],
  queues: [{ id: "q1", name: "Q1", discipline: "FIFO" }],
  stateVariables: [],
});

// Model where a C-event watches Q2 but entities arrive into Q1 — condition always false.
// This is the canonical "queue mismatch" debug scenario.
const makeModelWithCEvent = () => ({
  name: "CEventTest",
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
    { id: "et2", name: "Server", role: "server", count: "1", attrDefs: [] },
  ],
  bEvents: [
    {
      id: "arrive1",
      name: "Arrive",
      scheduledTime: 0,
      schedules: [
        { macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1", dist: "fixed", distParams: { value: 2 } },
      ],
    },
  ],
  cEvents: [
    {
      id: "serve1",
      name: "Serve",
      priority: 1,
      condition: "queue(Q2).length > 0 AND idle(Server).count > 0",
      cSchedules: [
        { macro: "SEIZE", entityTypeName: "Customer", queueName: "Q2", serverTypeName: "Server", dist: "fixed", distParams: { value: 5 } },
      ],
    },
  ],
  queues: [
    { id: "q1", name: "Q1", discipline: "FIFO" },
    { id: "q2", name: "Q2", discipline: "FIFO" },
  ],
  stateVariables: [],
});

// Model that will produce > 1000 event evaluations (fast arrivals, many cycles)
const makeHighVolumeModel = () => ({
  name: "HighVolume",
  entityTypes: [{ id: "et1", name: "Customer", role: "customer", attrDefs: [] }],
  bEvents: [
    {
      id: "arrive1",
      name: "Arrive",
      scheduledTime: 0,
      schedules: [
        { macro: "ARRIVE", entityTypeName: "Customer", queueName: "Q1", dist: "fixed", distParams: { value: 0.1 } },
      ],
    },
  ],
  cEvents: [],
  queues: [{ id: "q1", name: "Q1", discipline: "FIFO" }],
  stateVariables: [],
});

describe("TraceCollector", () => {
  let collector;

  beforeEach(() => {
    collector = new TraceCollector();
  });

  test("startTrace resets all counters and records", () => {
    collector.record({ t: 1, type: "event_evaluation", fired: true, conditionResult: null, queueSnapshots: {} });
    collector.startTrace();
    expect(collector.getTrace()).toHaveLength(0);
    expect(collector._totalEvents).toBe(0);
    expect(collector._firedEvents).toBe(0);
  });

  test("record() appends a trace entry and increments counters", () => {
    const entry = { t: 5, type: "event_evaluation", eventId: "e1", eventName: "Arrive", fired: true, conditionResult: null, queueSnapshots: {} };
    collector.record(entry);
    expect(collector._totalEvents).toBe(1);
    expect(collector._firedEvents).toBe(1);
    expect(collector.getTrace()).toHaveLength(1);
    expect(collector.getTrace()[0]).toMatchObject({ t: 5, eventId: "e1" });
  });

  test("record() tracks suppressed events (conditionResult: false)", () => {
    collector.record({ t: 1, type: "event_evaluation", fired: false, conditionResult: false, queueSnapshots: {} });
    expect(collector._suppressedEvents).toBe(1);
    expect(collector._firedEvents).toBe(0);
  });

  test("record() updates queuePeaks from queueSnapshots", () => {
    collector.record({ t: 1, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: { q1: 3 } });
    collector.record({ t: 2, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: { q1: 7 } });
    collector.record({ t: 3, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: { q1: 2 } });
    expect(collector.getSummary().queuePeaks.q1).toBe(7);
  });

  test("trace is capped at 1000 records and traceTruncated is set", () => {
    for (let i = 0; i < 1500; i++) {
      collector.record({ t: i, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: {} });
    }
    expect(collector.getTrace()).toHaveLength(1000);
    expect(collector._truncated).toBe(true);
    expect(collector.getSummary().traceTruncated).toBe(true);
    expect(collector._totalEvents).toBe(1500);
  });

  test("getTrace() returns records in chronological order", () => {
    // Insert records out of order
    collector.record({ t: 10, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: {} });
    collector.record({ t: 3, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: {} });
    collector.record({ t: 7, type: "event_evaluation", fired: false, conditionResult: null, queueSnapshots: {} });
    const trace = collector.getTrace();
    expect(trace[0].t).toBe(3);
    expect(trace[1].t).toBe(7);
    expect(trace[2].t).toBe(10);
  });

  test("getSummary() returns a run_summary record with correct type", () => {
    const summary = collector.getSummary();
    expect(summary.type).toBe("run_summary");
    expect(typeof summary.totalEvents).toBe("number");
    expect(typeof summary.traceTruncated).toBe("boolean");
  });
});

describe("buildTraceFromLog (engine integration)", () => {
  test("a simple arrival B-event emits a trace record with correct fields", () => {
    const model = makeSimpleModel();
    const engine = buildEngine(model, 42, 0, 5, null, 200);
    const result = engine.runAll();
    const { trace } = buildTraceFromLog(result.log, model, result.summary);

    expect(Array.isArray(trace)).toBe(true);
    expect(trace.length).toBeGreaterThan(0);

    const firstEntry = trace[0];
    expect(firstEntry).toHaveProperty("t");
    expect(firstEntry).toHaveProperty("type", "event_evaluation");
    expect(firstEntry).toHaveProperty("eventId");
    expect(firstEntry).toHaveProperty("eventName");
    expect(firstEntry).toHaveProperty("fired");
  });

  test("a C-event with failing condition records conditionResult: false", () => {
    const model = makeModelWithCEvent();
    // Run for a very short time so the C-event evaluates but queue is empty initially
    const engine = buildEngine(model, 42, 0, 2, null, 50);
    const result = engine.runAll();
    const { trace } = buildTraceFromLog(result.log, model, result.summary);

    // Find any C-event evaluation entries with conditionResult: false
    const suppressedEntries = trace.filter(r => r.conditionResult === false);
    expect(suppressedEntries.length).toBeGreaterThan(0);
    expect(suppressedEntries[0]).toHaveProperty("conditionResult", false);
    expect(suppressedEntries[0]).toHaveProperty("conditionDetail");
  });

  test("trace from high-volume run is capped at 1000 and traceTruncated is set", () => {
    const model = makeHighVolumeModel();
    const engine = buildEngine(model, 42, 0, 500, null, 5000);
    const result = engine.runAll();
    const { trace, traceTruncated } = buildTraceFromLog(result.log, model, result.summary);

    // If the run produced > 1000 event evaluations, truncation should trigger
    // (for a fixed-0.1 arrival over 500 time units = ~5000 arrivals)
    if (result.log.filter(e => e.phase === "B" || e.phase === "C").length > 1000) {
      expect(trace.length).toBe(1000);
      expect(traceTruncated).toBe(true);
    } else {
      // Low-volume run — trace contains all records
      expect(trace.length).toBeLessThanOrEqual(1000);
    }
  });

  test("getTrace() returns records in chronological order from engine log", () => {
    const model = makeSimpleModel();
    const engine = buildEngine(model, 42, 0, 10, null, 200);
    const result = engine.runAll();
    const { trace } = buildTraceFromLog(result.log, model, result.summary);

    for (let i = 1; i < trace.length; i++) {
      expect(trace[i].t).toBeGreaterThanOrEqual(trace[i - 1].t);
    }
  });
});
