// B4 — server turnaround: a server type with turnaroundDist/turnaroundDistParams
// is unavailable for a sampled time after each release. The entity moves on at
// once; the server sits in "turnaround" and becomes idle on TURNAROUND_END.

import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { validateModel } from "../../src/engine/validation.js";

const fix = v => ({ dist: "Fixed", distParams: { value: String(v) } });

// 1 VLCC, two cargoes waiting from t=0. Load 2, voyage 10, discharge 1,
// return voyage (turnaround) 20 → the second cargo cannot load until
// 2 + 10 + 20 = 32.
function tanker({ turnaround = { turnaroundDist: "Fixed", turnaroundDistParams: { value: "20" } }, release = "RELEASE(VLCC, Asia Crude Queue)", extraB = [], cargoes = 2 } = {}) {
  return {
    entityTypes: [
      { id: "cargo", name: "Cargo", role: "customer", count: 0, attrDefs: [] },
      { id: "vlcc", name: "VLCC", role: "server", count: 1, attrDefs: [], ...turnaround },
    ],
    queues: [{ id: "q1", name: "Gulf Loading Queue" }, { id: "q2", name: "Voyage Queue" }, { id: "q3", name: "Asia Crude Queue" }],
    stateVariables: [],
    bEvents: [
      ...Array.from({ length: cargoes }, (_, i) => ({ id: `arr${i}`, name: `Arrive ${i}`, scheduledTime: "0", effect: "ARRIVE(Cargo, Gulf Loading Queue)", schedules: [] })),
      { id: "loaded", name: "Loaded", scheduledTime: "9999", effect: [], schedules: [], probabilisticRouting: [{ queueName: "Voyage Queue", probability: 1 }] },
      { id: "voyaged", name: "Voyaged", scheduledTime: "9999", effect: release, schedules: [] },
      { id: "delivered", name: "Delivered", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ...extraB,
    ],
    cEvents: [
      // Loading claims the VLCC; the berth step is a DELAY so only the VLCC is held.
      { id: "load", name: "Load", priority: 1, effect: "ASSIGN(Gulf Loading Queue, VLCC)",
        condition: "queue(Gulf Loading Queue).length > 0 AND idle(VLCC).count > 0",
        cSchedules: [{ eventId: "voyaged", ...fix(12), useEntityCtx: true }] },
      { id: "discharge", name: "Discharge", priority: 2, effect: "DELAY(Asia Crude Queue)",
        condition: "queue(Asia Crude Queue).length > 0",
        cSchedules: [{ eventId: "delivered", ...fix(1), useEntityCtx: true }] },
    ],
  };
}

function run(model, T = 100, opts = {}) {
  const engine = buildEngine(model, 1, 0, T, null, 1e6, 5000, false, undefined, { collectTrace: true, ...opts });
  const r = engine.runAll();
  const loads = r.log.filter(e => /C: "Load"/.test(e.message || "")).map(e => e.time ?? e.clock);
  return { r, loads, log: r.log.map(e => e.message || "") };
}

describe("server turnaround (B4)", () => {
  it("keeps the server unavailable for the turnaround after release, while the entity moves on", () => {
    const { r, log } = run(tanker());
    const served = r.entitySummary.filter(e => e.role !== "server" && e.status === "done");
    expect(served).toHaveLength(2);
    const [first, second] = served.sort((a, b) => a.completionTime - b.completionTime);
    // First cargo: loads at 0, released at 12, discharged by 13 — not held by the return voyage.
    expect(first.completionTime).toBe(13);
    // Second cargo: VLCC back at 12 + 20 = 32, so it loads at 32 and finishes at 45.
    expect(second.completionTime).toBe(45);
    expect(log.some(m => /VLCC\) → turnaround for 20\.000 t/.test(m))).toBe(true);
    expect(log.some(m => /TURNAROUND: VLCC #\d+ available again at t=32\.000/.test(m))).toBe(true);
  });

  it("reports turnaround separately and counts it in utilisation", () => {
    const { r } = run(tanker(), 100);
    const v = r.summary.perResource.VLCC;
    // Busy with a cargo 0–12 and 32–44 = 24; turnaround 12–32 and 44–64 = 40.
    expect(v.busyUtilisation).toBeCloseTo(24 / 100, 4);
    expect(v.turnaroundTime).toBeCloseTo(40, 4);
    expect(v.turnaroundFraction).toBeCloseTo(40 / 100, 4);
    expect(v.utilisation).toBeCloseTo(64 / 100, 4);
    expect(v.turnaroundCount).toBe(2);
  });

  it("counts an unfinished turnaround up to the end of the run", () => {
    const { r } = run(tanker({ cargoes: 1 }), 20);
    const v = r.summary.perResource.VLCC;
    expect(v.turnaroundTime).toBeCloseTo(8, 4); // 12 → 20
    expect(v.utilisation).toBeCloseTo(1, 4);
  });

  it("applies on COMPLETE as well as RELEASE", () => {
    const m = tanker({ release: "COMPLETE()" });
    const { r } = run(m);
    const done = r.entitySummary.filter(e => e.role !== "server" && e.status === "done").map(e => e.completionTime).sort((a, b) => a - b);
    expect(done).toEqual([12, 44]);
  });

  it("changes nothing for a server type without turnaround", () => {
    const { r } = run(tanker({ turnaround: {} }));
    const done = r.entitySummary.filter(e => e.role !== "server" && e.status === "done").map(e => e.completionTime).sort((a, b) => a - b);
    expect(done).toEqual([13, 25]);
    expect(r.summary.perResource.VLCC.turnaroundFraction).toBeUndefined();
  });

  it("a failure during turnaround ends it; the server is available after repair", () => {
    const m = tanker({ extraB: [
      { id: "f", name: "Fail VLCC", scheduledTime: "15", effect: "FAIL(VLCC)", schedules: [] },
      { id: "r", name: "Repair VLCC", scheduledTime: "18", effect: "REPAIR(VLCC)", schedules: [] },
    ] });
    const { r, log } = run(m);
    // The stale TURNAROUND_END at t=32 is ignored; the second cargo loads at repair (t=18).
    expect(log.some(m2 => /no longer in turnaround — skipped/.test(m2))).toBe(true);
    const second = r.entitySummary.filter(e => e.role !== "server" && e.status === "done").map(e => e.completionTime).sort((a, b) => a - b)[1];
    expect(second).toBe(31);
    const v = r.summary.perResource.VLCC;
    expect(v.turnaroundTime).toBeCloseTo(3 + 20, 4); // 12–15, then 30–50 after the second voyage
    expect(v.failureCount).toBe(1);
  });

  it("is honoured by filtered Phase C (8+ C-events): the waiting cargo loads when turnaround ends", () => {
    const m = tanker();
    for (let i = 0; i < 8; i++) {
      m.queues.push({ id: `pad${i}`, name: `Pad ${i}` });
      m.cEvents.push({ id: `pad${i}`, name: `Pad ${i}`, priority: 9, effect: `DELAY(Pad ${i})`, condition: `queue(Pad ${i}).length > 0`, cSchedules: [] });
    }
    const { r } = run(m);
    const done = r.entitySummary.filter(e => e.role !== "server" && e.status === "done").map(e => e.completionTime).sort((a, b) => a - b);
    expect(done).toEqual([13, 45]);
  });

  it("samples from the distribution on its own stream (reproducible per seed)", () => {
    const m = tanker({ turnaround: { turnaroundDist: "Triangular", turnaroundDistParams: { min: "18", mode: "20", max: "24" } } });
    const a = run(m).r.summary.perResource.VLCC.turnaroundTime;
    const b = run(m).r.summary.perResource.VLCC.turnaroundTime;
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});

describe("V80 — turnaround validation", () => {
  const codes = m => {
    const v = validateModel({ ...m, maxSimTime: 100, terminationMode: "time" });
    return v.errors.filter(e => e.code === "V80").map(e => e.message);
  };

  it("accepts a valid server turnaround", () => {
    expect(codes(tanker())).toEqual([]);
  });

  it("rejects turnaround on a customer type", () => {
    const m = tanker();
    m.entityTypes[0] = { ...m.entityTypes[0], turnaroundDist: "Fixed", turnaroundDistParams: { value: "5" } };
    expect(codes(m).join(" ")).toMatch(/applies only to resources/);
  });

  it("requires both fields", () => {
    expect(codes(tanker({ turnaround: { turnaroundDist: "Fixed" } })).join(" ")).toMatch(/both turnaroundDist and turnaroundDistParams/);
  });

  it("rejects numeric parameter values and non-sampling distributions", () => {
    expect(codes(tanker({ turnaround: { turnaroundDist: "Fixed", turnaroundDistParams: { value: 20 } } })).join(" ")).toMatch(/must be strings/);
    expect(codes(tanker({ turnaround: { turnaroundDist: "Schedule", turnaroundDistParams: {} } })).join(" ")).toMatch(/sampling distribution/);
  });
});

describe("turnaround in batch results", () => {
  it("averages turnaround fraction, time and busy utilisation across replications", async () => {
    const { makeBatchResult } = await import("../../src/ui/execute/executeHelpers.js");
    const payloads = [1, 2].map(seed => ({ result: buildEngine(tanker(), seed, 0, 100, null, 1e6, 5000, false, undefined, { collectTrace: false }).runAll() }));
    const batch = makeBatchResult(payloads, {}, 100, 0);
    const v = batch.summary.perResource.VLCC;
    expect(v.turnaroundFraction).toBeCloseTo(0.4, 4);
    expect(v.turnaroundTime).toBeCloseTo(40, 4);
    expect(v.busyUtilisation).toBeCloseTo(0.24, 4);
    expect(v.utilisation).toBeCloseTo(0.64, 4);
  });
});
