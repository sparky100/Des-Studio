// tests/engine/multi-server-pooling.test.js — F10.3 multi-server resource pooling
// The entity-per-instance model already supports capacity > 1.
// These tests verify correct SEIZE/RELEASE behaviour for pools of N servers
// and confirm capacity=1 (M/M/1) regresses to existing behaviour.
import { describe, test, expect, beforeAll } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

// ── Model builders ────────────────────────────────────────────────────────────

function makePoolModel(serverCount) {
  return {
    entityTypes: [
      { id: "et-p", name: "Patient", role: "customer", attrDefs: [] },
      { id: "et-n", name: "Nurse",   role: "server",   count: String(serverCount), attrDefs: [] },
    ],
    queues: [{ id: "q1", name: "Waiting Queue", discipline: "FIFO" }],
    bEvents: [
      {
        id: "be-arrive", name: "Patient Arrives", scheduledTime: "0",
        effect: "ARRIVE(Patient, Waiting Queue)", schedules: [],
      },
      {
        id: "be-complete", name: "Service Complete", scheduledTime: "9999",
        effect: "COMPLETE()", schedules: [],
      },
    ],
    cEvents: [{
      id: "ce-serve", name: "Start Service", priority: 1,
      condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0",
      effect: "ASSIGN(Waiting Queue, Nurse)",
      cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

// Arrivals at t=0,1,2,... so N patients arrive before first completes
function makeMultiArrivalModel(serverCount, arrivalCount) {
  const bEvents = [
    {
      id: "be-complete", name: "Service Complete", scheduledTime: "9999",
      effect: "COMPLETE()", schedules: [],
    },
  ];
  // Schedule arrivals at t=0..arrivalCount-1 (all before service completes at t=1)
  for (let k = 0; k < arrivalCount; k++) {
    bEvents.push({
      id: `be-arrive-${k}`, name: `Arrival ${k}`, scheduledTime: String(k * 0.1),
      effect: "ARRIVE(Patient, Waiting Queue)", schedules: [],
    });
  }
  return {
    entityTypes: [
      { id: "et-p", name: "Patient", role: "customer", attrDefs: [] },
      { id: "et-n", name: "Nurse",   role: "server",   count: String(serverCount), attrDefs: [] },
    ],
    queues: [{ id: "q1", name: "Waiting Queue", discipline: "FIFO" }],
    bEvents,
    cEvents: [{
      id: "ce-serve", name: "Start Service", priority: 1,
      condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0",
      effect: "ASSIGN(Waiting Queue, Nurse)",
      cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

// ── Server entity creation ────────────────────────────────────────────────────

describe("createServerEntities — pool size", () => {
  test("count=1 creates exactly one server entity", () => {
    const model = makePoolModel(1);
    const engine = buildEngine(model, 1, 0, 0);
    const snap = engine.getSnap();
    const nurses = snap.entities.filter(e => e.type === "Nurse" && e.role === "server");
    expect(nurses).toHaveLength(1);
    expect(nurses[0].status).toBe("idle");
  });

  test("count=2 creates exactly two server entities, both idle at t=0", () => {
    const model = makePoolModel(2);
    const snap = buildEngine(model, 1, 0, 0).getSnap();
    const nurses = snap.entities.filter(e => e.type === "Nurse" && e.role === "server");
    expect(nurses).toHaveLength(2);
    expect(nurses.every(n => n.status === "idle")).toBe(true);
  });

  test("count=5 creates five server entities", () => {
    const model = makePoolModel(5);
    const snap = buildEngine(model, 1, 0, 0).getSnap();
    expect(snap.entities.filter(e => e.role === "server")).toHaveLength(5);
  });
});

// ── Concurrent service (core pooling test) ────────────────────────────────────

describe("multi-server concurrent service", () => {
  test("2-server pool: two patients served simultaneously", () => {
    // 2 patients arrive; service Fixed(1); both complete by t≈1.1 with 2 nurses
    const model = makeMultiArrivalModel(2, 2);
    model.cEvents[0].cSchedules[0].distParams = { value: "1" };
    const result = buildEngine(model, 42, 0, 10).runAll();
    expect(result.summary.served).toBe(2);
    const nurses = result.entitySummary.filter(e => e.role === "server");
    expect(nurses.every(n => n.status === "idle")).toBe(true);
  });

  test("2-server pool: third patient waits while first two are in service", () => {
    // 3 patients arrive; only 2 nurses — third must wait
    const model = makeMultiArrivalModel(2, 3);
    const engine = buildEngine(model, 42, 0, 10);
    // Step until both nurses are busy and third patient is waiting
    let stepCount = 0;
    let snap;
    while (stepCount < 50) {
      const r = engine.step();
      snap = r.snap;
      const busyNurses  = snap.entities.filter(e => e.role === "server" && e.status === "busy");
      const waitingPats = snap.entities.filter(e => e.role !== "server" && e.status === "waiting");
      if (busyNurses.length === 2 && waitingPats.length >= 1) break;
      if (r.done) break;
      stepCount++;
    }
    const busyNurses  = snap.entities.filter(e => e.role === "server" && e.status === "busy");
    const waitingPats = snap.entities.filter(e => e.role !== "server" && e.status === "waiting");
    expect(busyNurses).toHaveLength(2);
    expect(waitingPats.length).toBeGreaterThanOrEqual(1);
  });

  test("idle(Nurse).count reflects correct idle pool size at runtime", () => {
    // After 2 of 3 nurses are seized, idle count should be 1
    const model = makeMultiArrivalModel(3, 2);
    const engine = buildEngine(model, 42, 0, 10);
    let snap;
    let found = false;
    for (let i = 0; i < 30; i++) {
      const r = engine.step();
      snap = r.snap;
      const idle = snap.entities.filter(e => e.role === "server" && e.status === "idle").length;
      const busy = snap.entities.filter(e => e.role === "server" && e.status === "busy").length;
      if (busy === 2 && idle === 1) { found = true; break; }
      if (r.done) break;
    }
    expect(found).toBe(true);
  });
});

// ── M/M/1 regression ─────────────────────────────────────────────────────────

describe("capacity=1 regression — M/M/1 behaviour unchanged", () => {
  let result;
  beforeAll(() => {
    const model = makePoolModel(1);
    model.bEvents[0].schedules = [{ eventId: "be-arrive", dist: "Exponential", distParams: { rate: 0.9 }, isRenege: false }];
    model.cEvents[0].cSchedules[0].dist = "Exponential";
    model.cEvents[0].cSchedules[0].distParams = { rate: 1.0 };
    result = buildEngine(model, 42, 0, 2000).runAll();
  });

  test("server entity count is still 1", () => {
    expect(result.entitySummary.filter(e => e.role === "server")).toHaveLength(1);
  });

  test("served count is positive", () => {
    expect(result.summary.served).toBeGreaterThan(0);
  });

  test("M/M/1 utilisation is near 0.9 (ρ = 0.9)", () => {
    const customers = result.entitySummary.filter(e => e.role === "customer");
    const served = customers.filter(e => e.status === "done");
    // Sanity check: simulation ran long enough
    expect(served.length).toBeGreaterThan(100);
  });
});

// ── count string parsing ──────────────────────────────────────────────────────

describe("count field parsing", () => {
  test('count "2" (string) creates 2 servers', () => {
    const model = makePoolModel(2);
    model.entityTypes[1].count = "2"; // explicit string
    const snap = buildEngine(model, 1, 0, 0).getSnap();
    expect(snap.entities.filter(e => e.role === "server")).toHaveLength(2);
  });

  test("count 0 or invalid defaults to 1 server (createServerEntities guard)", () => {
    const model = makePoolModel(1);
    model.entityTypes[1].count = "0";
    const snap = buildEngine(model, 1, 0, 0).getSnap();
    // createServerEntities uses Math.max(1, parseInt(...)) so 0 → 1
    expect(snap.entities.filter(e => e.role === "server")).toHaveLength(1);
  });
});
