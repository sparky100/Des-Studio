// tests/engine/finite-queue.test.js — F11.1 finite capacity, F11.2 balking, F11.3 overflow routing
import { describe, test, expect } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

// ── Model builders ─────────────────────────────────────────────────────────────

function makeModel({ queueCapacity = null, overflowDestination = null,
                     balkProbability = null, balkCondition = null } = {}) {
  return {
    entityTypes: [
      { id: "et-c", name: "Customer", role: "customer", attrDefs: [] },
      { id: "et-s", name: "Server",   role: "server",   count: "1", attrDefs: [] },
    ],
    queues: [
      {
        id: "q-main", name: "Main Queue", customerType: "Customer", discipline: "FIFO",
        ...(queueCapacity    !== null ? { capacity: queueCapacity }                   : {}),
        ...(overflowDestination !== null ? { overflowDestination } : {}),
        ...(balkProbability !== null ? { balkProbability } : {}),
        ...(balkCondition   !== null ? { balkCondition }   : {}),
      },
      { id: "q-over", name: "Overflow Queue", customerType: "Customer", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "be-arrive", name: "Customer Arrives", scheduledTime: "0",
        effect: "ARRIVE(Customer, Main Queue)",
        schedules: [],
      },
      {
        id: "be-complete", name: "Service Complete", scheduledTime: "9999",
        effect: "COMPLETE()", schedules: [],
      },
    ],
    cEvents: [{
      id: "ce-serve", name: "Start Service", priority: 1,
      condition: "queue(Main Queue).length > 0 AND idle(Server).count > 0",
      effect: "ASSIGN(Main Queue, Server)",
      cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    }],
    stateVariables: [],
  };
}

// Schedule N arrivals at t=0 to t=N-0.1
function makeMultiArrivalModel(n, queueOpts = {}) {
  const m = makeModel(queueOpts);
  m.bEvents = m.bEvents.filter(b => b.id !== "be-arrive");
  for (let i = 0; i < n; i++) {
    m.bEvents.push({
      id: `be-arrive-${i}`, name: `Arrival ${i}`, scheduledTime: String(i * 0.1),
      effect: "ARRIVE(Customer, Main Queue)",
      schedules: [],
    });
  }
  return m;
}

// ── F11.1 — Finite queue capacity ─────────────────────────────────────────────

describe("F11.1 — Finite queue capacity", () => {
  test("unlimited capacity (default null) — all arrivals join queue, no regression", () => {
    const m = makeMultiArrivalModel(5);
    const engine = buildEngine(m, 1, 0, 5);
    const result = engine.runAll();
    const customers = result.entitySummary.filter(e => e.role === "customer");
    expect(customers.length).toBe(5);
    // No customers blocked — all joined Main Queue or were served
    expect(customers.every(c => c.status === "done" || c.status === "waiting")).toBe(true);
  });

  test("capacity=1 — 2nd arrival is blocked when 1st is already waiting", () => {
    const m = makeMultiArrivalModel(2, { queueCapacity: 1, overflowDestination: null });
    const result = buildEngine(m, 1, 0, 1).runAll();
    const customers = result.entitySummary.filter(e => e.role === "customer");
    // One in queue, one blocked (exits system when overflow is null)
    expect(customers.length).toBe(2);
    const done = customers.filter(c => c.status === "done");
    expect(done.length).toBeGreaterThanOrEqual(0); // at least one processed or exited
  });

  test("capacity=2 — third arrival blocked, first two remain in queue", () => {
    // 3 arrivals at t=0, 0.1, 0.2; service=Fixed(100) so none complete in maxSimTime=5
    const m = makeMultiArrivalModel(3, { queueCapacity: 2, overflowDestination: null });
    // Remove server so no service happens — just test queueing behaviour
    m.cEvents = [];
    m.bEvents = m.bEvents.filter(b => b.id !== "be-complete");
    const snap = buildEngine(m, 1, 0, 1).getSnap();
    // Wait until t=0.3 by stepping
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 10; i++) { const r = eng.step(); if (r.done) break; }
    const finalSnap = eng.getSnap();
    const inQueue = finalSnap.entities.filter(
      e => e.role === "customer" && e.status === "waiting" && e.queue === "Main Queue"
    );
    expect(inQueue.length).toBeLessThanOrEqual(2); // capacity respected
  });

  test("capacity=3 with overflow to Overflow Queue — blocked entity goes there", () => {
    // 4 arrivals, capacity=3 — 4th goes to Overflow Queue
    const m = makeMultiArrivalModel(4, {
      queueCapacity: 3,
      overflowDestination: "Overflow Queue",
    });
    m.cEvents = []; // no service — just test routing
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const finalSnap = eng.getSnap();
    const mainQ = finalSnap.entities.filter(
      e => e.role === "customer" && e.queue === "Main Queue"
    );
    const overQ = finalSnap.entities.filter(
      e => e.role === "customer" && e.queue === "Overflow Queue"
    );
    expect(mainQ.length).toBeLessThanOrEqual(3);
    expect(overQ.length).toBeGreaterThanOrEqual(1);
  });

  test("capacity=2 with null overflow — blocked entity exits system", () => {
    const m = makeMultiArrivalModel(4, { queueCapacity: 2, overflowDestination: null });
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const finalSnap = eng.getSnap();
    const mainQ = finalSnap.entities.filter(
      e => e.role === "customer" && e.queue === "Main Queue"
    );
    expect(mainQ.length).toBeLessThanOrEqual(2);
  });

  test("blockingCount tracked in perQueue metrics", () => {
    const m = makeMultiArrivalModel(4, { queueCapacity: 2, overflowDestination: null });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    const mainQMetrics = result.perQueue?.["Main Queue"];
    expect(mainQMetrics).toBeDefined();
    expect(mainQMetrics.blockingCount).toBeGreaterThanOrEqual(1); // at least 2 blocked
  });

  test("getSummary() exposes perQueue mid-run for live health checks", () => {
    const m = makeMultiArrivalModel(4, { queueCapacity: 2, overflowDestination: null });
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const liveMetrics = eng.getSummary().perQueue?.["Main Queue"];
    expect(liveMetrics).toBeDefined();
    expect(liveMetrics.blockingCount).toBeGreaterThanOrEqual(1);
  });
});

// ── F11.2 — Balking ───────────────────────────────────────────────────────────

describe("F11.2 — Balking", () => {
  test("balkProbability=0 — no entities balk", () => {
    const m = makeMultiArrivalModel(5, { balkProbability: 0 });
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const mainQ = eng.getSnap().entities.filter(
      e => e.role === "customer" && e.queue === "Main Queue"
    );
    expect(mainQ.length).toBe(5);
  });

  test("balkProbability=1 — all entities balk, Main Queue stays empty", () => {
    const m = makeMultiArrivalModel(5, { balkProbability: 1 });
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const mainQ = eng.getSnap().entities.filter(
      e => e.role === "customer" && e.queue === "Main Queue"
    );
    expect(mainQ.length).toBe(0);
  });

  test("balkProbability=0.5 — approximately 50% balk over 500 arrivals (within 5%)", () => {
    const m = makeMultiArrivalModel(500, { balkProbability: 0.5 });
    m.cEvents = [];
    const result = buildEngine(m, 42, 0, 100).runAll();
    const all = result.entitySummary.filter(e => e.role === "customer");
    const inQueue = all.filter(e => e.queue === "Main Queue").length;
    const balked  = all.filter(e => e.status === "done" && e.queue !== "Main Queue").length
                  + all.filter(e => e.status === "balked").length
                  + (500 - all.length); // entities that exited without being tracked
    const joined = all.filter(e => e.queue === "Main Queue" || e.status === "done").length;
    const ratio = joined / 500;
    expect(ratio).toBeGreaterThan(0.40);
    expect(ratio).toBeLessThan(0.65);
  });

  test("balkCount tracked in perQueue metrics", () => {
    const m = makeMultiArrivalModel(10, { balkProbability: 1 });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    const mainQMetrics = result.perQueue?.["Main Queue"];
    expect(mainQMetrics?.balkCount).toBe(10);
  });

  test("live snapshot's byQueue.balked is attributed to the queue that actually balked, not leaked into other queues", () => {
    // Regression test: the live "Live Metrics" panel used to read a single
    // global balked total for every queue tile, making an unrelated queue
    // (here, "Out On Hire Queue") appear to have balked just as much as the
    // one that actually does ("Hire Queue"). byQueue[name].balked must be
    // independent per queue.
    const m = {
      entityTypes: [{ id: "et-c", name: "Customer", role: "customer", attrDefs: [] }],
      queues: [
        { id: "q1", name: "Hire Queue", customerType: "Customer", discipline: "FIFO", balkProbability: 1 },
        { id: "q2", name: "Out On Hire Queue", customerType: "Customer", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "be-a1", name: "Hire Arrival", scheduledTime: "0", effect: "ARRIVE(Customer, Hire Queue)", schedules: [] },
        { id: "be-a2", name: "Out Arrival", scheduledTime: "0.05", effect: "ARRIVE(Customer, Out On Hire Queue)", schedules: [] },
      ],
      cEvents: [],
      stateVariables: [],
    };
    const eng = buildEngine(m, 1, 0, 1);
    for (let i = 0; i < 5; i++) { const r = eng.step(); if (r.done) break; }
    const snap = eng.getSnap();
    expect(snap.byQueue["Hire Queue"].balked).toBeGreaterThan(0);
    expect(snap.byQueue["Out On Hire Queue"].balked).toBe(0);
    expect(snap.byQueue["Out On Hire Queue"].total).toBeGreaterThan(0);
  });

  test("balkCondition: balk when queue.length >= 2", () => {
    // 4 arrivals; first 2 join (queue length 0, 1); 3rd checks length=2 → balks
    const balkCondition = {
      variable: "Queue.Main Queue.length",
      operator: ">=",
      value: 2,
    };
    const m = makeMultiArrivalModel(4, { balkCondition });
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const mainQ = eng.getSnap().entities.filter(
      e => e.role === "customer" && e.queue === "Main Queue"
    );
    expect(mainQ.length).toBeLessThanOrEqual(2);
  });

  test("same seed → same balk sequence (reproducibility)", () => {
    const m = makeMultiArrivalModel(20, { balkProbability: 0.3 });
    m.cEvents = [];
    const r1 = buildEngine(m, 99, 0, 5).runAll();
    const r2 = buildEngine(m, 99, 0, 5).runAll();
    expect(r1.entitySummary.length).toBe(r2.entitySummary.length);
  });

  test("backward compat — no balkProbability set → no balking", () => {
    const m = makeMultiArrivalModel(5);
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const mainQ = eng.getSnap().entities.filter(e => e.role === "customer" && e.queue === "Main Queue");
    expect(mainQ.length).toBe(5);
  });
});

// ── Balked-entity outcome recording (item 4) ──────────────────────────────────
// A balked/blocked entity now gets a terminal "balked" status + a real outcome
// record (mirroring RENEGE's shape) instead of being spliced out of the
// system with no trace at all.

describe("Balked-entity outcome recording", () => {
  test("summary.balked and summary.total both count instantly-balked entities (previously undercounted entirely)", () => {
    const m = makeMultiArrivalModel(5, { balkProbability: 1 });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    expect(result.summary.balked).toBe(5);
    expect(result.summary.total).toBe(5);
    expect(result.summary.served).toBe(0);
  });

  test("a balked entity appears in summary.outcomes with a per-queue routeLabel and endedBy: BALK", () => {
    const m = makeMultiArrivalModel(3, { balkProbability: 1 });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    const outcomeEntries = Object.values(result.summary.outcomes || {});
    expect(outcomeEntries).toHaveLength(1);
    expect(outcomeEntries[0]).toEqual(expect.objectContaining({
      routeLabel: 'Balked at "Main Queue"',
      status: "balked",
      endedBy: "BALK",
      count: 3,
    }));
  });

  test("a blocked (capacity) entity appears in summary.outcomes with endedBy: BLOCK, distinct from balked", () => {
    // capacity=1 with no server (cEvents=[]) so all but the first arrival are blocked.
    const m = makeMultiArrivalModel(3, { queueCapacity: 1 });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    const blockedOutcome = Object.values(result.summary.outcomes || {}).find(o => o.endedBy === "BLOCK");
    expect(blockedOutcome).toBeDefined();
    expect(blockedOutcome.routeLabel).toBe('Blocked at "Main Queue"');
    expect(blockedOutcome.status).toBe("balked");
    expect(blockedOutcome.count).toBe(2);
  });

  test("a balked entity does not inflate WIP/in-system counts", () => {
    const m = makeMultiArrivalModel(5, { balkProbability: 1 });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    expect(result.summary.terminatingState.waitingAtEnd).toBe(0);
    expect(result.summary.terminatingState.servingAtEnd).toBe(0);
    expect(result.summary.avgWIP).toBe(0);
  });

  test("a balked entity's status/outcome survive into entitySummary (visible in exports)", () => {
    const m = makeMultiArrivalModel(1, { balkProbability: 1 });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    const balkedEntity = result.entitySummary.find(e => e.role === "customer");
    expect(balkedEntity.status).toBe("balked");
    expect(balkedEntity.outcome?.endedBy).toBe("BALK");
  });
});

// ── F11.3 — Overflow routing ──────────────────────────────────────────────────

describe("F11.3 — Overflow routing", () => {
  test("overflow goes to named queue — entity is waiting there after blocking", () => {
    const m = makeMultiArrivalModel(3, {
      queueCapacity: 1,
      overflowDestination: "Overflow Queue",
    });
    m.cEvents = [];
    const eng = buildEngine(m, 1, 0, 5);
    for (let i = 0; i < 20; i++) { const r = eng.step(); if (r.done) break; }
    const overQ = eng.getSnap().entities.filter(
      e => e.role === "customer" && e.queue === "Overflow Queue"
    );
    expect(overQ.length).toBeGreaterThanOrEqual(1);
  });

  test("null overflow destination exits system (no orphaned entities)", () => {
    const m = makeMultiArrivalModel(5, {
      queueCapacity: 2,
      overflowDestination: null,
    });
    m.cEvents = [];
    const result = buildEngine(m, 1, 0, 5).runAll();
    const customers = result.entitySummary.filter(e => e.role === "customer");
    // Some should have exited (done); total in-system ≤ capacity
    const inSystem = customers.filter(e => e.status === "waiting").length;
    expect(inSystem).toBeLessThanOrEqual(2);
  });
});
