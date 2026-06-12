import { describe, test, expect } from "vitest";
import { enumerateSweepableParams, applySweepValue, applySweepValues, generateSweepValues, generate2DSweepValues } from "../../src/engine/sweep-params.js";
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

  test("caps at 50 points", () => {
    const values = generateSweepValues(0, 100, 1);
    expect(values.length).toBeLessThanOrEqual(50);
  });

  test("returns exactly 1 point when min equals max", () => {
    const values = generateSweepValues(5, 5, 1);
    expect(values).toEqual([5]);
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
  };

  test("returns entity type count params with natural English labels", () => {
    const params = enumerateSweepableParams(basicModel);
    const etCounts = params.filter(p => p.type === "entityTypeCount");
    expect(etCounts.length).toBe(2);
    expect(etCounts[0].label).toBe("Number of Server");
    expect(etCounts[0].currentValue).toBe(1);
    expect(etCounts[1].label).toBe("Number of Customer");
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

  test("throws when grid exceeds 50 points", () => {
    expect(() =>
      generate2DSweepValues({ min: 0, max: 10, step: 1 }, { min: 0, max: 10, step: 1 })
    ).toThrow(/exceeds 50/);
  });

  test("allows exactly 50 points", () => {
    const pairs = generate2DSweepValues({ min: 0, max: 4, step: 1 }, { min: 0, max: 9, step: 1 });
    expect(pairs).toHaveLength(50); // 5 x 10 = 50
  });

  test("throws descriptive error with dimensions", () => {
    expect(() =>
      generate2DSweepValues({ min: 0, max: 10, step: 1 }, { min: 0, max: 10, step: 1 })
    ).toThrow(/11 x 11 = 121/);
  });
});
