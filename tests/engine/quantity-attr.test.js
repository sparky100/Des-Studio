// B1 — volume-weighted results via entityTypes[].quantityAttr.
import { describe, test, expect, beforeEach } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { resetSeq } from "../../src/engine/entities.js";
import { validateModel } from "../../src/engine/validation.js";
import { makeBatchResult } from "../../src/ui/execute/executeHelpers.js";
import { buildGoalGapsFromResults } from "../../src/llm/prompts.js";

beforeEach(() => { resetSeq(); });

// Aframax 0.7, Suezmax 1, VLCC 2 — one of each every 3 time units.
function mixedModel({ quantityAttr = "volume", attrDef = { name: "volume", valueType: "number", defaultValue: 1 } } = {}) {
  const arr = (id, t, vol) => ({ id, name: id, scheduledTime: String(t), effect: `ARRIVE(Cargo, Berth Queue);SET_ATTR(volume, ${vol})`,
    schedules: [{ eventId: id, dist: "Fixed", distParams: { value: "3" } }] });
  return {
    entityTypes: [
      { id: "c", name: "Cargo", role: "customer", ...(quantityAttr ? { quantityAttr } : {}), attrDefs: [attrDef] },
      { id: "t", name: "Terminal", role: "server", count: "1", attrDefs: [] },
    ],
    queues: [{ id: "q", name: "Berth Queue", customerType: "Cargo", discipline: "FIFO" }],
    stateVariables: [],
    bEvents: [arr("Aframax", 0, 0.7), arr("Suezmax", 1, 1), arr("VLCC", 2, 2),
      { id: "done", name: "Loaded", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] }],
    cEvents: [{ id: "load", name: "Load", priority: 1, effect: "ASSIGN(Berth Queue, Terminal)",
      condition: "queue(Berth Queue).length > 0 AND idle(Terminal).count > 0",
      cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "0.5" }, useEntityCtx: true }] }],
  };
}

describe("quantityAttr — engine", () => {
  test("mixed sizes match a hand calculation", () => {
    // t < 29.9: 10 of each size arrive and finish → 10 × (0.7 + 1 + 2) = 37
    const r = buildEngine(mixedModel(), 1, 0, 29.9, null, 1e6, 5000, true).runAll();
    const s = r.summary;
    expect(s.served).toBe(30);
    expect(s.servedQuantity).toBeCloseTo(37, 8);
    expect(s.quantityInSystem).toBe(0);
    expect(s.quantityThroughByQueue["Berth Queue"]).toBeCloseTo(37, 8);
    expect(s.perResource.Terminal.quantityProcessed).toBeCloseTo(37, 8);
    expect(Object.values(s.outcomes)[0].quantity).toBeCloseTo(37, 8);
    expect(s.queueJourneyQuantities["Berth Queue→Loaded"]).toBeCloseTo(37, 8);
    expect(s.quantityAttrs).toEqual({ Cargo: "volume" });
  });

  test("time series carries quantity in system and quantity waiting per queue", () => {
    // Slow terminal (service 5) so the queue builds up.
    const m = mixedModel();
    m.cEvents[0].cSchedules[0].distParams.value = "5";
    const r = buildEngine(m, 1, 0, 12, null, 1e6, 5000, true).runAll();
    const last = r.timeSeries.at(-1);
    expect(last.quantityInSystem).toBeGreaterThan(0);
    expect(last.byQueue["Berth Queue"].quantityWaiting).toBeGreaterThan(0);
    expect(last.quantityInSystem).toBeGreaterThanOrEqual(last.byQueue["Berth Queue"].quantityWaiting);
    expect(r.summary.quantityInSystem).toBeCloseTo(last.quantityInSystem, 6);
  });

  test("no quantity fields when no type sets quantityAttr", () => {
    const r = buildEngine(mixedModel({ quantityAttr: null }), 1, 0, 10, null, 1e6, 5000, true).runAll();
    expect(r.summary.servedQuantity).toBeUndefined();
    expect(r.timeSeries.at(-1).quantityInSystem).toBeUndefined();
    expect(r.timeSeries.at(-1).byQueue["Berth Queue"].quantityWaiting).toBeUndefined();
  });

  test("fixed size: servedQuantity = size × served in every replication", () => {
    const m = mixedModel({ attrDef: { name: "volume", valueType: "number", defaultValue: 4 } });
    m.bEvents = [
      { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Cargo, Berth Queue)",
        schedules: [{ eventId: "arr", dist: "Exponential", distParams: { mean: "0.7" } }] },
      m.bEvents.at(-1),
    ];
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = buildEngine(m, seed, 5, 50, null, 1e6).runAll().summary;
      expect(s.servedQuantity).toBeCloseTo(4 * s.served, 8);
    }
  });
});

describe("quantityAttr — batch results", () => {
  const rep = (served, servedQuantity, through, processed) => ({ result: { summary: {
    served, servedQuantity, quantityInSystem: 1, renegedQuantity: 0, balkedQuantity: 0,
    quantityThroughByQueue: { Q: through }, perResource: { T: { total: 1, utilisation: 0.5, quantityProcessed: processed } },
    outcomes: { done: { routeId: "done", routeLabel: "Done", status: "completed", count: served, quantity: servedQuantity } },
    quantityAttrs: { Cargo: "volume" },
  } } });

  test("quantities are the mean per replication and labelled", () => {
    const batch = makeBatchResult([rep(10, 20, 20, 20), rep(14, 30, 30, 30)], {}, 10, 0);
    const s = batch.summary;
    expect(s.served).toBe(24);          // counts stay summed
    expect(s.servedQuantity).toBe(25);  // quantity is the mean
    expect(s.quantityAggregation).toBe("mean-of-replications");
    expect(s.quantityThroughByQueue.Q).toBe(25);
    expect(s.perResource.T.quantityProcessed).toBe(25);
    expect(s.outcomes.done.count).toBe(24);
    expect(s.outcomes.done.quantity).toBe(25);
  });
});

describe("quantityAttr — goals", () => {
  const results = { summary: {
    servedQuantity: 37, quantityThroughByQueue: { "Berth Queue": 37 },
    perResource: { Terminal: { utilisation: 0.2, quantityProcessed: 37 } },
  } };
  test("unscoped, queue- and resource-scoped quantity goals resolve", () => {
    const model = { goals: [
      { label: "served", metric: "summary.servedQuantity", operator: ">=", target: 30 },
      { label: "through", metric: "summary.quantityThrough", operator: ">=", target: 40, scope: { type: "queue", id: "q", name: "Berth Queue" } },
      { label: "processed", metric: "resource.quantityProcessed", operator: ">=", target: 30, scope: { type: "resource", id: "t", name: "Terminal" } },
      { label: "util", metric: "resource.utilisation", operator: "<", target: 0.9, scope: { type: "resource", id: "t", name: "Terminal" } },
    ] };
    const gaps = buildGoalGapsFromResults(model, results);
    expect(gaps.map(g => [g.label, g.current, g.met])).toEqual([
      ["served", 37, true], ["through", 37, false], ["processed", 37, true], ["util", 0.2, true],
    ]);
  });
});

describe("quantityAttr — validation", () => {
  const codes = (m) => { const v = validateModel(m); return [...v.errors, ...v.warnings].map(x => x.code).filter(c => c === "V78" || c === "V79"); };
  test("valid numeric attribute with a default passes", () => {
    expect(codes(mixedModel())).toEqual([]);
  });
  test("missing attribute is blocking", () => {
    expect(codes(mixedModel({ quantityAttr: "tonnes" }))).toEqual(["V78"]);
  });
  test("non-numeric attribute is blocking", () => {
    expect(codes(mixedModel({ attrDef: { name: "volume", valueType: "string", defaultValue: "4" } }))).toEqual(["V78"]);
  });
  test("no default and no dist warns", () => {
    expect(codes(mixedModel({ attrDef: { name: "volume", valueType: "number" } }))).toEqual(["V79"]);
  });
  test("a distribution counts as a source of values", () => {
    expect(codes(mixedModel({ attrDef: { name: "volume", valueType: "number", dist: "Uniform", distParams: { min: "0.7", max: "2" } } }))).toEqual([]);
  });
});
