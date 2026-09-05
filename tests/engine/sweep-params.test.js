import { describe, test, expect } from "vitest";
import {
  enumerateSweepableParams, applySweepValue, applySweepValues,
  generateSweepValues, generate2DSweepValues, sampleLatinHypercube,
  isIntegerParamType, checkStudyBudget, MAX_STUDY_REPLICATIONS,
} from "../../src/engine/sweep-params.js";
import { TEMPLATES } from "../../src/engine/templates.js";

describe("generateSweepValues", () => {
  test("generates values from min to max by step", () => {
    const values = generateSweepValues(1, 5, 1);
    expect(values).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles fractional steps", () => {
    const values = generateSweepValues(0, 1, 0.25);
    expect(values).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  // Sprint F-Study Phase 2: the old flat "cap at 50, silently decimate" was
  // replaced by a replication-budget guard (points x replicationsPerPoint),
  // since the number of points alone isn't what determines run cost.
  test("no longer silently caps at 50 — a 101-point sweep at 1 replication each is well under the budget", () => {
    const values = generateSweepValues(0, 100, 1);
    expect(values.length).toBe(101);
  });

  test("throws a clear error when points x replicationsPerPoint exceeds the budget", () => {
    expect(() => generateSweepValues(0, 2500, 1, 1)).toThrow(/2,501 replications/);
    expect(() => generateSweepValues(0, 2500, 1, 1)).toThrow(/exceeding the 2,000-replication budget/);
  });

  test("the budget accounts for replicationsPerPoint, not just point count", () => {
    // 100 points is fine alone, but x25 replications each exceeds the budget.
    expect(() => generateSweepValues(0, 99, 1, 25)).toThrow(/2,500 replications/);
    // The same 100 points at 20 replications each lands exactly on the budget.
    expect(() => generateSweepValues(0, 99, 1, 20)).not.toThrow();
  });

  test("returns exactly 1 point when min equals max", () => {
    const values = generateSweepValues(5, 5, 1);
    expect(values).toEqual([5]);
  });
});

describe("checkStudyBudget", () => {
  test("does not throw when within budget", () => {
    expect(() => checkStudyBudget(10, 10)).not.toThrow();
  });

  test("throws with a message naming both factors and the total", () => {
    expect(() => checkStudyBudget(100, 30)).toThrow(/100 points x 30 replications each/);
    expect(() => checkStudyBudget(100, 30)).toThrow(/3,000 replications/);
  });

  test("respects a custom maxTotal", () => {
    expect(() => checkStudyBudget(10, 10, 50)).toThrow(/50-replication budget/);
  });

  test("defaults an invalid/zero replicationsPerPoint to 1", () => {
    expect(() => checkStudyBudget(MAX_STUDY_REPLICATIONS, 0)).not.toThrow();
    expect(() => checkStudyBudget(MAX_STUDY_REPLICATIONS + 1, NaN)).toThrow();
  });
});

describe("isIntegerParamType", () => {
  test("returns true for discrete count/capacity param types", () => {
    for (const type of ["entityTypeCount", "shiftCapacity", "schedulePatternPeriodCapacity",
      "schedulePatternDefaultCapacity", "queueCapacity", "containerCapacity", "containerInitialLevel"]) {
      expect(isIntegerParamType(type)).toBe(true);
    }
  });

  test("returns false for continuous param types", () => {
    for (const type of ["schedulePatternBaseCapacity", "bEventDistParam", "bEventPiecewisePeriodParam",
      "cEventDistParam", "cEventPiecewisePeriodParam", "stateVarInit"]) {
      expect(isIntegerParamType(type)).toBe(false);
    }
  });
});

describe("sampleLatinHypercube", () => {
  const params = [
    { path: "entityTypes.et1.count", label: "Server count", type: "entityTypeCount", range: { min: 1, max: 10 } },
    { path: "bEvents.b1.schedules.distParams.mean", label: "Arrival mean", type: "bEventDistParam", range: { min: 0.5, max: 5 } },
  ];

  test("returns exactly `points` samples, each with one value per parameter", () => {
    const samples = sampleLatinHypercube(params, { points: 8, baseSeed: 1 });
    expect(samples).toHaveLength(8);
    for (const s of samples) {
      expect(s.params).toHaveLength(2);
      expect(s.params[0].path).toBe(params[0].path);
      expect(s.params[1].path).toBe(params[1].path);
    }
  });

  test("every sampled value is within its parameter's range", () => {
    const samples = sampleLatinHypercube(params, { points: 20, baseSeed: 7 });
    for (const s of samples) {
      expect(s.params[0].value).toBeGreaterThanOrEqual(1);
      expect(s.params[0].value).toBeLessThanOrEqual(10);
      expect(s.params[1].value).toBeGreaterThanOrEqual(0.5);
      expect(s.params[1].value).toBeLessThanOrEqual(5);
    }
  });

  test("rounds samples to integers for integer param types, keeps fractional values for continuous ones", () => {
    const samples = sampleLatinHypercube(params, { points: 10, baseSeed: 3 });
    for (const s of samples) {
      expect(Number.isInteger(s.params[0].value)).toBe(true);
    }
    expect(samples.some(s => !Number.isInteger(s.params[1].value))).toBe(true);
  });

  test("is deterministic — the same baseSeed produces the same samples every time", () => {
    const a = sampleLatinHypercube(params, { points: 12, baseSeed: 99 });
    const b = sampleLatinHypercube(params, { points: 12, baseSeed: 99 });
    expect(a).toEqual(b);
  });

  test("a different baseSeed produces different samples", () => {
    const a = sampleLatinHypercube(params, { points: 12, baseSeed: 1 });
    const b = sampleLatinHypercube(params, { points: 12, baseSeed: 2 });
    expect(a).not.toEqual(b);
  });

  test("never uses Math.random — stubbing it out must not change the result", () => {
    const before = sampleLatinHypercube(params, { points: 10, baseSeed: 55 });
    const original = Math.random;
    Math.random = () => { throw new Error("Math.random must not be called"); };
    try {
      const after = sampleLatinHypercube(params, { points: 10, baseSeed: 55 });
      expect(after).toEqual(before);
    } finally {
      Math.random = original;
    }
  });

  test("Latin hypercube coverage: each dimension's strata are each hit exactly once", () => {
    // With n points, a true LHS puts exactly one sample in each of the n
    // equal-width strata per dimension — verify for the (unrounded) continuous
    // second parameter, where strata boundaries are exact.
    const n = 10;
    const samples = sampleLatinHypercube(params, { points: n, baseSeed: 21 });
    const [min, max] = [0.5, 5];
    const strataHit = new Set(samples.map(s => Math.floor(((s.params[1].value - min) / (max - min)) * n)));
    expect(strataHit.size).toBe(n);
  });

  test("throws when given no parameters", () => {
    expect(() => sampleLatinHypercube([], { points: 5 })).toThrow(/at least one parameter/);
  });

  test("throws when a parameter has no range", () => {
    expect(() => sampleLatinHypercube([{ path: "x" }], { points: 5 })).toThrow(/missing a valid range/);
  });

  test("throws when points is less than 1", () => {
    expect(() => sampleLatinHypercube(params, { points: 0 })).toThrow(/at least 1 point/);
  });
});

describe("enumerateSweepableParams", () => {
  const basicModel = {
    entityTypes: [
      { id: "et_srv", name: "Server", role: "server", count: "1" },
      { id: "et_cust", name: "Customer", role: "customer", count: "0" },
    ],
    queues: [
      { id: "q_cust", name: "Customer", customerType: "Customer", capacity: "10", discipline: "FIFO" },
      { id: "q_unlimited", name: "Unlimited", customerType: "Other", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      { id: "b_arr", name: "Arrival", schedules: [{ dist: "Exponential", distParams: { mean: "1.111" } }] },
    ],
    cEvents: [
      { id: "c_seize", name: "Seize", cSchedules: [{ dist: "Exponential", distParams: { mean: "1" } }] },
    ],
    stateVariables: [
      { name: "threshold", initialValue: "10" },
    ],
    containerTypes: [
      { id: "BikesAvailable", capacity: 10, initialLevel: 5 },
      { id: "Overflow", capacity: null, initialLevel: 0 },
    ],
  };

  test("returns entity type count params with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const etCounts = params.filter(p => p.type === "entityTypeCount");
    expect(etCounts.length).toBe(1);
    expect(etCounts[0].label).toBe("Number of Server");
    expect(etCounts[0].currentValue).toBe(1);
  });

  test("excludes customer/patient entity types from servers group", () => {
    const params = enumerateSweepableParams(basicModel);
    const labels = params.map(p => p.label);
    expect(labels).not.toContain("Number of Customer");
  });

  test("returns queue capacity params with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const caps = params.filter(p => p.type === "queueCapacity");
    expect(caps.length).toBe(2);
    expect(caps[0].label).toBe("Customer — maximum capacity");
    expect(caps[0].currentValue).toBe(10);
    expect(caps[1].currentValue).toBe(Infinity);
  });

  test("returns B-Event distribution params with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const bDist = params.filter(p => p.type === "bEventDistParam");
    expect(bDist.length).toBe(1);
    expect(bDist[0].label).toBe("Arrival — mean");
    expect(bDist[0].currentValue).toBeCloseTo(1.111);
  });

  test("returns C-Event distribution params with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const cDist = params.filter(p => p.type === "cEventDistParam");
    expect(cDist.length).toBe(1);
    expect(cDist[0].label).toBe("Seize — mean");
  });

  test("returns state variable initial values with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const svs = params.filter(p => p.type === "stateVarInit");
    expect(svs.length).toBe(1);
    expect(svs[0].label).toBe("threshold — starting value");
  });

  test("returns container capacity and initial-level params with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const caps = params.filter(p => p.type === "containerCapacity");
    const inits = params.filter(p => p.type === "containerInitialLevel");
    expect(caps).toHaveLength(2);
    expect(inits).toHaveLength(2);
    expect(caps[0].label).toBe("BikesAvailable — capacity");
    expect(caps[0].currentValue).toBe(10);
    expect(caps[0].path).toBe("containerTypes.BikesAvailable.capacity");
    expect(inits[0].label).toBe("BikesAvailable — initial level");
    expect(inits[0].currentValue).toBe(5);
    // Unbounded container (capacity: null) reports Infinity, mirroring an
    // unlimited queue's currentValue.
    expect(caps[1].currentValue).toBe(Infinity);
  });

  test("handles model with no entity types gracefully", () => {
    const params = enumerateSweepableParams({});
    expect(Array.isArray(params)).toBe(true);
  });

  // ── Shift schedule tests ────────────────────────────────────────────────────

  test("skips entityTypeCount for servers with shift schedules", () => {
    const model = {
      entityTypes: [
        { id: "et_nurse", name: "Nurse", role: "server", count: "3",
          shiftSchedule: [{ time: 0, capacity: 3 }, { time: 480, capacity: 6 }] },
      ],
    };
    const params = enumerateSweepableParams(model);
    expect(params.filter(p => p.type === "entityTypeCount")).toHaveLength(0);
  });

  test("enumerates shiftCapacity params for each shift period", () => {
    const model = {
      entityTypes: [
        { id: "et_nurse", name: "Nurse", role: "server", count: "3",
          shiftSchedule: [{ time: 0, capacity: 3 }, { time: 480, capacity: 6 }, { time: 960, capacity: 2 }] },
      ],
    };
    const params = enumerateSweepableParams(model);
    const shiftParams = params.filter(p => p.type === "shiftCapacity");
    expect(shiftParams).toHaveLength(3);
    expect(shiftParams[0].label).toBe("Nurse — shift 1 capacity");
    expect(shiftParams[0].subLabel).toBe("from minute 0");
    expect(shiftParams[0].currentValue).toBe(3);
    expect(shiftParams[1].label).toBe("Nurse — shift 2 capacity");
    expect(shiftParams[1].subLabel).toBe("from minute 480");
    expect(shiftParams[1].currentValue).toBe(6);
    expect(shiftParams[2].label).toBe("Nurse — shift 3 capacity");
    expect(shiftParams[2].currentValue).toBe(2);
  });

  test("entity type without shift schedule still appears as entityTypeCount", () => {
    const model = {
      entityTypes: [
        { id: "et_doc", name: "Doctor", role: "server", count: "4" },
        { id: "et_nurse", name: "Nurse", role: "server", count: "3",
          shiftSchedule: [{ time: 0, capacity: 3 }] },
      ],
    };
    const params = enumerateSweepableParams(model);
    const etCounts = params.filter(p => p.type === "entityTypeCount");
    expect(etCounts).toHaveLength(1);
    expect(etCounts[0].label).toBe("Number of Doctor");
    const shiftParams = params.filter(p => p.type === "shiftCapacity");
    expect(shiftParams).toHaveLength(1);
    expect(shiftParams[0].label).toBe("Nurse — shift 1 capacity");
  });

  // ── Weekly schedulePattern tests ────────────────────────────────────────────
  // schedulePattern is a second, separate way (alongside shiftSchedule) a
  // server's capacity can vary over time. engine/index.js unconditionally
  // overwrites `count` with the pattern's own capacity at runtime, so
  // sweeping `count` for such a type would silently do nothing.

  test("skips entityTypeCount for servers with a weekly schedulePattern", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "TriageNurse", role: "server", count: "4",
        schedulePattern: {
          mode: "absolute", type: "weekly",
          periods: [{ dayOfWeek: 1, start: "08:00", end: "22:00", capacity: 4 }],
          defaultCapacity: 2,
        },
      }],
    };
    const params = enumerateSweepableParams(model);
    expect(params.filter(p => p.type === "entityTypeCount")).toHaveLength(0);
  });

  test("enumerates schedulePatternPeriodCapacity + schedulePatternDefaultCapacity for absolute-mode patterns", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "TriageNurse", role: "server", count: "4",
        schedulePattern: {
          mode: "absolute", type: "weekly",
          periods: [
            { dayOfWeek: 1, start: "08:00", end: "22:00", capacity: 4 },
            { dayOfWeek: 2, start: "08:00", end: "22:00", capacity: 4 },
          ],
          defaultCapacity: 2,
        },
      }],
    };
    const params = enumerateSweepableParams(model);
    const periodParams = params.filter(p => p.type === "schedulePatternPeriodCapacity");
    expect(periodParams).toHaveLength(2);
    expect(periodParams[0].label).toBe("TriageNurse — Mon 08:00-22:00 capacity");
    expect(periodParams[0].currentValue).toBe(4);
    expect(periodParams[0].path).toBe("entityTypes.et_nurse.schedulePattern.periods[0].capacity");
    expect(periodParams[1].label).toBe("TriageNurse — Tue 08:00-22:00 capacity");

    const defaultParams = params.filter(p => p.type === "schedulePatternDefaultCapacity");
    expect(defaultParams).toHaveLength(1);
    expect(defaultParams[0].label).toBe("TriageNurse — default capacity (outside scheduled periods)");
    expect(defaultParams[0].currentValue).toBe(2);
    expect(defaultParams[0].path).toBe("entityTypes.et_nurse.schedulePattern.defaultCapacity");
  });

  test("enumerates a single schedulePatternBaseCapacity param for multiplier-mode patterns", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "TriageNurse", role: "server",
        schedulePattern: {
          mode: "multiplier", type: "weekly", baseCapacity: 4,
          periods: [{ dayOfWeek: 1, start: "08:00", end: "22:00", capacity: 1 }],
        },
      }],
    };
    const params = enumerateSweepableParams(model);
    const baseParams = params.filter(p => p.type === "schedulePatternBaseCapacity");
    expect(baseParams).toHaveLength(1);
    expect(baseParams[0].currentValue).toBe(4);
    expect(baseParams[0].path).toBe("entityTypes.et_nurse.schedulePattern.baseCapacity");
    // Multiplier mode doesn't enumerate one param per period — a single
    // scalar scales all of them proportionally.
    expect(params.filter(p => p.type === "schedulePatternPeriodCapacity")).toHaveLength(0);
  });

  // ── Piecewise distribution tests ────────────────────────────────────────────

  test("enumerates piecewise period params for B-events, not a broken 'periods' entry", () => {
    const model = {
      bEvents: [{
        id: "b_arr", name: "Arrivals",
        schedules: [{
          dist: "Piecewise",
          distParams: {
            periods: [
              { startTime: 0,   distribution: { dist: "Exponential", distParams: { mean: "2" } } },
              { startTime: 480, distribution: { dist: "Exponential", distParams: { mean: "5" } } },
            ],
          },
        }],
      }],
    };
    const params = enumerateSweepableParams(model);

    // No broken "periods" param
    expect(params.find(p => p.label?.includes("periods"))).toBeUndefined();

    // Two piecewise period params
    const piecewiseParams = params.filter(p => p.type === "bEventPiecewisePeriodParam");
    expect(piecewiseParams).toHaveLength(2);
    expect(piecewiseParams[0].label).toBe("Arrivals — period 1 mean");
    expect(piecewiseParams[0].subLabel).toBe("from minute 0");
    expect(piecewiseParams[0].currentValue).toBe(2);
    expect(piecewiseParams[1].label).toBe("Arrivals — period 2 mean");
    expect(piecewiseParams[1].subLabel).toBe("from minute 480");
    expect(piecewiseParams[1].currentValue).toBe(5);
  });

  test("enumerates piecewise period params for C-events", () => {
    const model = {
      cEvents: [{
        id: "c_svc", name: "Service",
        cSchedules: [{
          dist: "Piecewise",
          distParams: {
            periods: [
              { startTime: 0, distribution: { dist: "Exponential", distParams: { mean: "3" } } },
            ],
          },
        }],
      }],
    };
    const params = enumerateSweepableParams(model);
    const piecewiseParams = params.filter(p => p.type === "cEventPiecewisePeriodParam");
    expect(piecewiseParams).toHaveLength(1);
    expect(piecewiseParams[0].label).toBe("Service — period 1 mean");
    expect(piecewiseParams[0].currentValue).toBe(3);
  });

  test("handles lowercase piecewise dist name", () => {
    const model = {
      bEvents: [{
        id: "b_arr", name: "Arrivals",
        schedules: [{
          dist: "piecewise",
          distParams: {
            periods: [
              { startTime: 0, distribution: { dist: "Exponential", distParams: { mean: "1" } } },
            ],
          },
        }],
      }],
    };
    const params = enumerateSweepableParams(model);
    expect(params.filter(p => p.type === "bEventPiecewisePeriodParam")).toHaveLength(1);
  });
});

describe("applySweepValue", () => {
  test("modifies entity type count", () => {
    const model = { entityTypes: [{ id: "et_srv", name: "Server", count: "1" }] };
    const param = { type: "entityTypeCount", targetId: "et_srv" };
    const cloned = applySweepValue(model, param, 3);
    expect(cloned.entityTypes[0].count).toBe("3");
    expect(model.entityTypes[0].count).toBe("1"); // original unchanged
  });

  test("modifies queue capacity", () => {
    const model = { queues: [{ id: "q_cust", name: "Queue", capacity: "10" }] };
    const param = { type: "queueCapacity", targetId: "q_cust" };
    const cloned = applySweepValue(model, param, 20);
    expect(cloned.queues[0].capacity).toBe("20");
  });

  test("sets queue capacity to empty string for Infinity", () => {
    const model = { queues: [{ id: "q_cust", name: "Queue", capacity: "10" }] };
    const param = { type: "queueCapacity", targetId: "q_cust" };
    const cloned = applySweepValue(model, param, -1);
    expect(cloned.queues[0].capacity).toBe("");
  });

  test("modifies B-Event distribution parameter", () => {
    const model = { bEvents: [{ id: "b_arr", schedules: [{ dist: "Exponential", distParams: { mean: "1.111" } }] }] };
    const param = { type: "bEventDistParam", targetId: "b_arr", paramKey: "mean" };
    const cloned = applySweepValue(model, param, 2.5);
    expect(cloned.bEvents[0].schedules[0].distParams.mean).toBe("2.5");
  });

  test("modifies C-Event distribution parameter", () => {
    const model = { cEvents: [{ id: "c_seize", cSchedules: [{ dist: "Exponential", distParams: { mean: "1" } }] }] };
    const param = { type: "cEventDistParam", targetId: "c_seize", paramKey: "mean" };
    const cloned = applySweepValue(model, param, 0.5);
    expect(cloned.cEvents[0].cSchedules[0].distParams.mean).toBe("0.5");
  });

  test("modifies container capacity", () => {
    const model = { containerTypes: [{ id: "BikesAvailable", capacity: 10, initialLevel: 5 }] };
    const param = { type: "containerCapacity", targetId: "BikesAvailable" };
    const cloned = applySweepValue(model, param, 20);
    expect(cloned.containerTypes[0].capacity).toBe(20);
    expect(model.containerTypes[0].capacity).toBe(10); // original unchanged
  });

  test("sets container capacity to null (unbounded) for a value <= 0", () => {
    const model = { containerTypes: [{ id: "BikesAvailable", capacity: 10, initialLevel: 5 }] };
    const param = { type: "containerCapacity", targetId: "BikesAvailable" };
    const cloned = applySweepValue(model, param, 0);
    expect(cloned.containerTypes[0].capacity).toBeNull();
  });

  test("modifies container initial level", () => {
    const model = { containerTypes: [{ id: "BikesAvailable", capacity: 10, initialLevel: 5 }] };
    const param = { type: "containerInitialLevel", targetId: "BikesAvailable" };
    const cloned = applySweepValue(model, param, 8);
    expect(cloned.containerTypes[0].initialLevel).toBe(8);
    expect(model.containerTypes[0].initialLevel).toBe(5); // original unchanged
  });

  test("clamps container initial level to minimum 0", () => {
    const model = { containerTypes: [{ id: "BikesAvailable", capacity: 10, initialLevel: 5 }] };
    const param = { type: "containerInitialLevel", targetId: "BikesAvailable" };
    const cloned = applySweepValue(model, param, -3);
    expect(cloned.containerTypes[0].initialLevel).toBe(0);
  });

  test("modifies state variable initial value", () => {
    const model = { stateVariables: [{ name: "threshold", initialValue: "10" }] };
    const param = { type: "stateVarInit", targetId: "threshold" };
    const cloned = applySweepValue(model, param, 25);
    expect(cloned.stateVariables[0].initialValue).toBe("25");
  });

  test("clamps distribution params to minimum 0.001", () => {
    const model = { bEvents: [{ id: "b_arr", schedules: [{ dist: "Exponential", distParams: { mean: "1" } }] }] };
    const param = { type: "bEventDistParam", targetId: "b_arr", paramKey: "mean" };
    const cloned = applySweepValue(model, param, 0);
    expect(parseFloat(cloned.bEvents[0].schedules[0].distParams.mean)).toBeGreaterThanOrEqual(0.001);
  });

  // ── Shift capacity ──────────────────────────────────────────────────────────

  test("modifies shift schedule period capacity", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "Nurse", role: "server",
        shiftSchedule: [{ time: 0, capacity: 3 }, { time: 480, capacity: 6 }],
      }],
    };
    const param = { type: "shiftCapacity", targetId: "et_nurse", periodIndex: 1 };
    const cloned = applySweepValue(model, param, 8);
    expect(cloned.entityTypes[0].shiftSchedule[1].capacity).toBe("8");
    expect(model.entityTypes[0].shiftSchedule[1].capacity).toBe(6); // original unchanged
  });

  test("clamps shift capacity to minimum 1", () => {
    const model = {
      entityTypes: [{ id: "et_srv", name: "Server", role: "server",
        shiftSchedule: [{ time: 0, capacity: 2 }] }],
    };
    const param = { type: "shiftCapacity", targetId: "et_srv", periodIndex: 0 };
    const cloned = applySweepValue(model, param, 0);
    expect(parseInt(cloned.entityTypes[0].shiftSchedule[0].capacity, 10)).toBeGreaterThanOrEqual(1);
  });

  // ── Weekly schedulePattern capacity ─────────────────────────────────────────

  test("modifies a schedulePattern period's capacity, allowing 0 (a legitimate closed period)", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "TriageNurse", role: "server",
        schedulePattern: {
          mode: "absolute", type: "weekly",
          periods: [{ dayOfWeek: 1, start: "08:00", end: "22:00", capacity: 4 }],
          defaultCapacity: 2,
        },
      }],
    };
    const param = { type: "schedulePatternPeriodCapacity", targetId: "et_nurse", periodIndex: 0 };
    const cloned = applySweepValue(model, param, 0);
    expect(cloned.entityTypes[0].schedulePattern.periods[0].capacity).toBe(0);
    expect(model.entityTypes[0].schedulePattern.periods[0].capacity).toBe(4); // original unchanged
  });

  test("modifies a schedulePattern's defaultCapacity", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "TriageNurse", role: "server",
        schedulePattern: { mode: "absolute", type: "weekly", periods: [], defaultCapacity: 2 },
      }],
    };
    const param = { type: "schedulePatternDefaultCapacity", targetId: "et_nurse" };
    const cloned = applySweepValue(model, param, 5);
    expect(cloned.entityTypes[0].schedulePattern.defaultCapacity).toBe(5);
  });

  test("modifies a multiplier-mode schedulePattern's baseCapacity", () => {
    const model = {
      entityTypes: [{
        id: "et_nurse", name: "TriageNurse", role: "server",
        schedulePattern: { mode: "multiplier", type: "weekly", baseCapacity: 4, periods: [] },
      }],
    };
    const param = { type: "schedulePatternBaseCapacity", targetId: "et_nurse" };
    const cloned = applySweepValue(model, param, 8);
    expect(cloned.entityTypes[0].schedulePattern.baseCapacity).toBe(8);
  });

  // ── Piecewise period params ─────────────────────────────────────────────────

  test("modifies a B-event piecewise period parameter", () => {
    const model = {
      bEvents: [{
        id: "b_arr", name: "Arrivals",
        schedules: [{
          dist: "Piecewise",
          distParams: {
            periods: [
              { startTime: 0,   distribution: { dist: "Exponential", distParams: { mean: "2" } } },
              { startTime: 480, distribution: { dist: "Exponential", distParams: { mean: "5" } } },
            ],
          },
        }],
      }],
    };
    const param = { type: "bEventPiecewisePeriodParam", targetId: "b_arr", scheduleIndex: 0, periodIndex: 1, paramKey: "mean" };
    const cloned = applySweepValue(model, param, 10);
    expect(cloned.bEvents[0].schedules[0].distParams.periods[1].distribution.distParams.mean).toBe("10");
    // other period unchanged
    expect(cloned.bEvents[0].schedules[0].distParams.periods[0].distribution.distParams.mean).toBe("2");
    // original unchanged
    expect(model.bEvents[0].schedules[0].distParams.periods[1].distribution.distParams.mean).toBe("5");
  });

  test("modifies a C-event piecewise period parameter", () => {
    const model = {
      cEvents: [{
        id: "c_svc", name: "Service",
        cSchedules: [{
          dist: "Piecewise",
          distParams: {
            periods: [
              { startTime: 0, distribution: { dist: "Exponential", distParams: { mean: "3" } } },
            ],
          },
        }],
      }],
    };
    const param = { type: "cEventPiecewisePeriodParam", targetId: "c_svc", scheduleIndex: 0, periodIndex: 0, paramKey: "mean" };
    const cloned = applySweepValue(model, param, 7);
    expect(cloned.cEvents[0].cSchedules[0].distParams.periods[0].distribution.distParams.mean).toBe("7");
    expect(model.cEvents[0].cSchedules[0].distParams.periods[0].distribution.distParams.mean).toBe("3");
  });
});

describe("M/M/1 template sweep", () => {
  test("enumerateSweepableParams returns expected params for M/M/1", () => {
    const mm1 = TEMPLATES.find(t => t.name === "M/M/1 Queue");
    expect(mm1).toBeDefined();
    const params = enumerateSweepableParams(mm1);
    const labels = params.map(p => p.label);
    expect(labels).toContain("Number of Server");
    expect(labels).toContain("Arrival — mean");
    expect(labels).toContain("Seize — mean");
  });

  test("applying server count 2 produces valid model structure", () => {
    const mm1 = TEMPLATES.find(t => t.name === "M/M/1 Queue");
    const param = { type: "entityTypeCount", targetId: mm1.entityTypes.find(e => e.name === "Server").id };
    const cloned = applySweepValue(mm1, param, 2);
    const serverType = cloned.entityTypes.find(e => e.name === "Server");
    expect(serverType.count).toBe("2");
  });
});

describe("applySweepValues", () => {
  test("applies a single config-value pair", () => {
    const model = { entityTypes: [{ id: "et_srv", name: "Server", count: "1" }] };
    const cloned = applySweepValues(model, [
      { paramConfig: { type: "entityTypeCount", targetId: "et_srv" }, value: 3 },
    ]);
    expect(cloned.entityTypes[0].count).toBe("3");
    expect(model.entityTypes[0].count).toBe("1");
  });

  test("applies two independent config-value pairs", () => {
    const model = {
      entityTypes: [{ id: "et_srv", name: "Server", count: "1" }],
      queues: [{ id: "q_cust", name: "Queue", capacity: "10" }],
    };
    const cloned = applySweepValues(model, [
      { paramConfig: { type: "entityTypeCount", targetId: "et_srv" }, value: 3 },
      { paramConfig: { type: "queueCapacity", targetId: "q_cust" }, value: 20 },
    ]);
    expect(cloned.entityTypes[0].count).toBe("3");
    expect(cloned.queues[0].capacity).toBe("20");
    expect(model.entityTypes[0].count).toBe("1");
    expect(model.queues[0].capacity).toBe("10");
  });

  test("applies three config-value pairs", () => {
    const model = {
      entityTypes: [{ id: "et_srv", name: "Server", count: "1" }],
      queues: [{ id: "q_cust", name: "Queue", capacity: "10" }],
      stateVariables: [{ name: "threshold", initialValue: "10" }],
    };
    const cloned = applySweepValues(model, [
      { paramConfig: { type: "entityTypeCount", targetId: "et_srv" }, value: 3 },
      { paramConfig: { type: "queueCapacity", targetId: "q_cust" }, value: 20 },
      { paramConfig: { type: "stateVarInit", targetId: "threshold" }, value: 25 },
    ]);
    expect(cloned.entityTypes[0].count).toBe("3");
    expect(cloned.queues[0].capacity).toBe("20");
    expect(cloned.stateVariables[0].initialValue).toBe("25");
  });

  test("returns unmodified clone when sweepConfigs is empty", () => {
    const model = { entityTypes: [{ id: "et_srv", name: "Server", count: "1" }] };
    const cloned = applySweepValues(model, []);
    expect(cloned.entityTypes[0].count).toBe("1");
  });
});

describe("generate2DSweepValues", () => {
  test("produces cartesian product of two ranges", () => {
    const pairs = generate2DSweepValues({ min: 1, max: 3, step: 1 }, { min: 10, max: 30, step: 10 });
    expect(pairs).toHaveLength(9); // 3 x 3
    expect(pairs[0]).toEqual({ valueA: 1, valueB: 10 });
    expect(pairs[8]).toEqual({ valueA: 3, valueB: 30 });
  });

  test("produces correct grid size for asymmetric ranges", () => {
    const pairs = generate2DSweepValues({ min: 0, max: 2, step: 1 }, { min: 5, max: 5, step: 1 });
    expect(pairs).toHaveLength(3); // 3 x 1
  });

  // Sprint F-Study Phase 2: a fixed 50-point grid cap was replaced by a
  // replication-budget guard (points x replicationsPerPoint) — a grid that
  // was previously always rejected past 50 points is now fine as long as
  // the total replication count (grid points x replications) stays under
  // MAX_STUDY_REPLICATIONS (2000, at the default replicationsPerPoint of 1).
  test("a grid of more than 50 points no longer throws at the default (1 replication per point)", () => {
    const pairs = generate2DSweepValues({ min: 0, max: 10, step: 1 }, { min: 0, max: 10, step: 1 });
    expect(pairs).toHaveLength(121); // 11 x 11
  });

  test("allows a grid of exactly 2000 points at 1 replication each", () => {
    const pairs = generate2DSweepValues({ min: 0, max: 39, step: 1 }, { min: 0, max: 49, step: 1 });
    expect(pairs).toHaveLength(2000); // 40 x 50 = 2000
  });

  test("throws a clear error naming both grid dimensions and replications when the budget is exceeded", () => {
    expect(() =>
      generate2DSweepValues({ min: 0, max: 39, step: 1 }, { min: 0, max: 49, step: 1 }, 2)
    ).toThrow(/2,000 points x 2 replications each/);
  });
});
