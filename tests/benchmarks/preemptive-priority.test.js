// Analytic benchmark: two-class M/M/1 with PREEMPTIVE-RESUME priority
// (Sprint 99 — docs/reviews/sprint-99-preemption-plan.md).
//
// One server, μ = 1 for both classes. High priority λ₁ = 0.3, low λ₂ = 0.4
// (ρ₁ = 0.3, ρ = 0.7). A high-priority arrival interrupts a low-priority job
// in service; the low job resumes later with its remaining time.
//
// Mean time in system (preemptive-resume priority, M/G/1 with exponential
// service, E[S²] = 2/μ²):
//   T₁ = (1/μ) / (1 − ρ₁)                                       = 1.4286
//   T₂ = (1/μ) / (1 − ρ₁) + (λ₁ + λ₂)/μ² / ((1 − ρ₁)(1 − ρ))  = 4.7619
// Check: the arrival-weighted mean (0.3·T₁ + 0.4·T₂)/0.7 = 3.3333 = 1/(μ − λ),
// the plain M/M/1 value, as it must be for a work-conserving discipline.
//
// Run two ways. Hand-built: PREEMPT(Server) is gated on "a high job is
// waiting, the server is busy, and it is serving a low job" (lowInService).
// The preempted low job keeps its arrival time, so FIFO resumes it ahead of
// later low arrivals. Preempt-and-assign: ASSIGN(High Queue, Server, PREEMPT,
// PRIORITY(cls)) alone, no counter. Before Sprint 99 the interrupted job's stale completion
// still fired (cutting resumed service short and decrementing lowInService
// twice), so the low class finished too early.
import { beforeAll, describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

const LAMBDA_HIGH = 0.3;
const LAMBDA_LOW = 0.4;
const MU = 1;
const RHO_HIGH = LAMBDA_HIGH / MU;
const RHO = (LAMBDA_HIGH + LAMBDA_LOW) / MU;
const T_HIGH = (1 / MU) / (1 - RHO_HIGH);
const T_LOW = (1 / MU) / (1 - RHO_HIGH) + ((LAMBDA_HIGH + LAMBDA_LOW) / (MU * MU)) / ((1 - RHO_HIGH) * (1 - RHO));

const REPS = 10;
const BASE_SEED = 9900;
const MAX_SIM = 20000;
const WARMUP = 1000;
const TOLERANCE = 0.05;

// Completion events fire only when scheduled. The usual "9999" placeholder
// would fire once on its own inside a 20,000-unit run.
const NEVER = "1e12";

const SERVICE = { dist: "Exponential", distParams: { mean: String(1 / MU) }, useEntityCtx: true };

// Hand-built: a counter and a gating C-event decide when to PREEMPT.
function handBuiltModel() {
  return {
    entityTypes: [
      { id: "high", name: "High", role: "customer", count: 0, attrDefs: [] },
      { id: "low", name: "Low", role: "customer", count: 0, attrDefs: [] },
      { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [{ name: "lowInService", initialValue: "0" }],
    queues: [
      { id: "qh", name: "High Queue", customerType: "High", discipline: "FIFO" },
      { id: "ql", name: "Low Queue", customerType: "Low", discipline: "FIFO" },
    ],
    bEvents: [
      { id: "arrive_high", name: "High arrives", scheduledTime: "0", effect: ["ARRIVE(High, High Queue)"],
        schedules: [{ eventId: "arrive_high", dist: "Exponential", distParams: { mean: String(1 / LAMBDA_HIGH) } }] },
      { id: "arrive_low", name: "Low arrives", scheduledTime: "0", effect: ["ARRIVE(Low, Low Queue)"],
        schedules: [{ eventId: "arrive_low", dist: "Exponential", distParams: { mean: String(1 / LAMBDA_LOW) } }] },
      { id: "done_high", name: "High done", scheduledTime: NEVER, effect: ["COMPLETE()"], schedules: [] },
      { id: "done_low", name: "Low done", scheduledTime: NEVER, effect: ["COMPLETE()", "SET(lowInService, lowInService-1)"], schedules: [] },
    ],
    cEvents: [
      { id: "preempt", name: "High interrupts low", priority: 0,
        condition: "queue(High Queue).length > 0 AND idle(Server).count == 0 AND lowInService > 0",
        effect: ["PREEMPT(Server)", "SET(lowInService, lowInService-1)"], cSchedules: [] },
      { id: "serve_high", name: "Serve high", priority: 1,
        condition: "queue(High Queue).length > 0 AND idle(Server).count > 0",
        effect: ["ASSIGN(High Queue, Server)"],
        cSchedules: [{ eventId: "done_high", ...SERVICE }] },
      { id: "serve_low", name: "Serve low", priority: 2,
        condition: "queue(Low Queue).length > 0 AND idle(Server).count > 0",
        effect: ["ASSIGN(Low Queue, Server)", "SET(lowInService, lowInService+1)"],
        cSchedules: [{ eventId: "done_low", ...SERVICE }] },
    ],
  };
}

// Preempt-and-assign (Sprint 99 Phase 2): one effect, no counter or gating event.
function preemptAssignModel() {
  const m = handBuiltModel();
  m.entityTypes[0].attrDefs = [{ name: "cls", valueType: "number", defaultValue: 1, mutable: false }];
  m.entityTypes[1].attrDefs = [{ name: "cls", valueType: "number", defaultValue: 2, mutable: false }];
  m.stateVariables = [];
  m.bEvents[3].effect = ["COMPLETE()"];
  m.cEvents = [
    { id: "serve_high", name: "Serve high", priority: 0,
      condition: "queue(High Queue).length > 0",
      effect: ["ASSIGN(High Queue, Server, PREEMPT, PRIORITY(cls))"],
      cSchedules: [{ eventId: "done_high", ...SERVICE }] },
    { id: "serve_low", name: "Serve low", priority: 1,
      condition: "queue(Low Queue).length > 0 AND idle(Server).count > 0",
      effect: ["ASSIGN(Low Queue, Server)"],
      cSchedules: [{ eventId: "done_low", ...SERVICE }] },
  ];
  return m;
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

describe.each([
  ["hand-built PREEMPT", handBuiltModel],
  ["ASSIGN … PREEMPT", preemptAssignModel],
])("Preemptive-resume priority M/M/1 (two classes) — %s", (_label, model) => {
  const sojourn = { High: [], Low: [] };
  const lowServiceMeans = [];
  let interrupted = 0;
  const finalCounters = [];

  // Run in beforeAll (not the describe body) and yield between replications:
  // minutes of synchronous simulation at collection time starve the Vitest
  // worker's RPC heartbeat ("Timeout calling onTaskUpdate").
  beforeAll(async () => {
    for (let i = 0; i < REPS; i++) {
      await new Promise(resolve => setImmediate(resolve));
      const r = buildEngine(model(), BASE_SEED + i, WARMUP, MAX_SIM, null, 5_000_000).runAll();
      const done = r.entitySummary.filter(e => e.status === "done" && e.arrivalTime >= WARMUP);
      for (const type of ["High", "Low"]) {
        sojourn[type].push(mean(done.filter(e => e.type === type).map(e => e.completionTime - e.arrivalTime)));
      }
      const lows = done.filter(e => e.type === "Low");
      lowServiceMeans.push(mean(lows.map(e => e.stages.reduce((s, st) => s + st.stageService, 0))));
      interrupted += lows.filter(e => e.stages.some(st => st.interruptions)).length;
      finalCounters.push(r.snap.scalars.lowInService ?? 0);
    }
  }, 300000);

  it(`high-priority time in system ≈ ${T_HIGH.toFixed(3)} (±${TOLERANCE * 100}%)`, () => {
    expect(Math.abs(mean(sojourn.High) - T_HIGH) / T_HIGH).toBeLessThan(TOLERANCE);
  });

  it(`low-priority time in system ≈ ${T_LOW.toFixed(3)} (±${TOLERANCE * 100}%)`, () => {
    expect(Math.abs(mean(sojourn.Low) - T_LOW) / T_LOW).toBeLessThan(TOLERANCE);
  });

  it("preemption actually happens, and an interrupted job still receives its full service (mean ≈ 1/μ)", () => {
    // The in-service counter balances: no stale completion decremented it.
    expect(finalCounters.every(v => v === 0 || v === 1)).toBe(true);
    expect(interrupted).toBeGreaterThan(1000);
    expect(Math.abs(mean(lowServiceMeans) - 1 / MU) / (1 / MU)).toBeLessThan(TOLERANCE);
  });
});
