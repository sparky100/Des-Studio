// B3 — a state variable on the right-hand side of a condition resolves
// dynamically (clock >= closureStart), instead of being read as literal text.
import { describe, test, expect, beforeEach } from "vitest";
import { evaluatePredicate, getPredicateDependencies } from "../../src/engine/conditions.js";
import { validateModel } from "../../src/engine/validation.js";
import { buildEngine } from "../../src/engine/index.js";
import { resetSeq } from "../../src/engine/entities.js";

beforeEach(() => { resetSeq(); });

const at = (clock, scalars) => ({ clock, scalars, helpers: {} });

describe("evaluatePredicate — state variable RHS", () => {
  test("bare state-variable name resolves to its current value", () => {
    const cond = { variable: "clock", operator: ">=", value: "closureStart" };
    expect(evaluatePredicate(cond, at(99, { closureStart: 100 }))).toBe(false);
    expect(evaluatePredicate(cond, at(100, { closureStart: 100 }))).toBe(true);
    // Changing the variable changes the outcome — it is not frozen at compile time.
    expect(evaluatePredicate(cond, at(100, { closureStart: 150 }))).toBe(false);
  });

  test("state.<name> resolves too", () => {
    const cond = { variable: "clock", operator: "<", value: "state.closureEnd" };
    expect(evaluatePredicate(cond, at(120, { closureEnd: 130 }))).toBe(true);
    expect(evaluatePredicate(cond, at(130, { closureEnd: 130 }))).toBe(false);
  });

  test("works inside a legacy string condition", () => {
    const cond = "clock >= closureStart AND closureEnabled == 1";
    expect(evaluatePredicate(cond, at(100, { closureStart: 100, closureEnabled: 1 }))).toBe(true);
    expect(evaluatePredicate(cond, at(100, { closureStart: 100, closureEnabled: 0 }))).toBe(false);
  });

  test("a literal that is not a state variable stays a literal", () => {
    const state = { scalars: { closureStart: 100 }, currentEntity: { attrs: { grade: "sour" } } };
    expect(evaluatePredicate({ variable: "Entity.grade", operator: "==", value: "sour" }, state)).toBe(true);
    expect(evaluatePredicate({ variable: "Entity.grade", operator: "==", value: "sweet" }, state)).toBe(false);
  });

  test("regression: queue(A).length < queue(B).length is unchanged", () => {
    const helpers = { waitingOf: q => (q === "A" ? [1] : [1, 2, 3]) };
    const state = { scalars: {}, helpers, model: { queues: [] } };
    expect(evaluatePredicate({ variable: "queue(A).length", operator: "<", value: "queue(B).length" }, state)).toBe(true);
    expect(evaluatePredicate({ variable: "queue(B).length", operator: "<", value: "queue(A).length" }, state)).toBe(false);
  });

  test("the RHS state variable is a dependency, so filtered Phase C re-evaluates", () => {
    const deps = getPredicateDependencies({ variable: "clock", operator: ">=", value: "closureStart" });
    expect(deps.stateVars.has("closureStart")).toBe(true);
    expect(deps.clock).toBe(true);
  });
});

describe("validation — V76 non-numeric literal in a numeric comparison", () => {
  const base = (condition, stateVariables = [{ name: "closureStart", valueType: "number", initialValue: 100 }]) => ({
    entityTypes: [], queues: [], bEvents: [], stateVariables,
    cEvents: [{ id: "c1", name: "Close", condition, effect: "", cSchedules: [] }],
  });
  const v76 = m => validateModel(m).warnings.filter(w => w.code === "V76");

  test("warns on a misspelt variable compared numerically", () => {
    const w = v76(base({ variable: "clock", operator: ">=", value: "closureStrat" }));
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("closureStrat");
  });

  test("no warning when the RHS is a declared state variable (resolved, not literal)", () => {
    expect(v76(base({ variable: "clock", operator: ">=", value: "closureStart" }))).toEqual([]);
    expect(v76(base({ variable: "clock", operator: ">=", value: "state.closureStart" }))).toEqual([]);
  });

  test("warns for == against text when the left side is numeric", () => {
    expect(v76(base({ variable: "queue(Q).length", operator: "==", value: "full" }))).toHaveLength(1);
  });

  test("no warning for numbers, dynamic references or text comparisons of text", () => {
    expect(v76(base({ variable: "clock", operator: ">=", value: 100 }))).toEqual([]);
    expect(v76(base({ variable: "clock", operator: ">=", value: "100" }))).toEqual([]);
    expect(v76(base({ variable: "queue(A).length", operator: "<", value: "queue(B).length" }))).toEqual([]);
    expect(v76(base({ variable: "Entity.grade", operator: "==", value: "sour" }))).toEqual([]);
  });
});

describe("closure gate without a daily tick", () => {
  // Two C-events flip hormuzOpen at closureStart and closureEnd; a third
  // moves lots only while open. Arrivals every 1.0 provide the event stream.
  function gateModel() {
    return {
      entityTypes: [
        { id: "lot", name: "Lot", role: "customer", attrDefs: [] },
        { id: "lane", name: "Lane", role: "server", count: "1", attrDefs: [] },
      ],
      queues: [{ id: "q", name: "Strait", customerType: "Lot", discipline: "FIFO" }],
      stateVariables: [
        { name: "closureEnabled", valueType: "number", initialValue: 1 },
        { name: "closureStart", valueType: "number", initialValue: 10 },
        { name: "closureEnd", valueType: "number", initialValue: 20 },
        { name: "hormuzOpen", valueType: "number", initialValue: 1 },
      ],
      bEvents: [
        { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Lot, Strait)",
          schedules: [{ eventId: "arr", dist: "Fixed", distParams: { value: "1" } }] },
        { id: "done", name: "Transited", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "close", name: "Close", priority: 1, effect: "SET(hormuzOpen, 0)", cSchedules: [],
          condition: "clock >= closureStart AND clock < closureEnd AND closureEnabled == 1 AND hormuzOpen == 1" },
        { id: "reopen", name: "Reopen", priority: 1, effect: "SET(hormuzOpen, 1)", cSchedules: [],
          condition: "clock >= closureEnd AND hormuzOpen == 0" },
        { id: "transit", name: "Transit", priority: 2, effect: "ASSIGN(Strait, Lane)",
          condition: "queue(Strait).length > 0 AND idle(Lane).count > 0 AND hormuzOpen == 1",
          cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "0.5" }, useEntityCtx: true }] },
      ],
    };
  }

  test("closes at closureStart, reopens at closureEnd, nothing transits in between", () => {
    const result = buildEngine(gateModel(), 1, 0, 30).runAll();
    expect(result.summary.activityCounts.close.count).toBe(1);
    expect(result.summary.activityCounts.reopen.count).toBe(1);
    const transitTimes = (result.log || [])
      .filter(e => /^C: "Transit"  ·/.test(e.message || ""))
      .map(e => e.time ?? e.clock);
    expect(transitTimes.length).toBe(31);
    expect(transitTimes.some(t => t >= 10 && t < 20)).toBe(false);
    expect(transitTimes.filter(t => t === 20).length).toBe(1); // first lot after reopening, others queue behind the single lane
    expect(result.summary.served).toBe(30);
  });
});
