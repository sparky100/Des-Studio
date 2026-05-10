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

  test("returns entity type count params", () => {
    const params = enumerateSweepableParams(basicModel);
    const etCounts = params.filter(p => p.type === "entityTypeCount");
    expect(etCounts.length).toBe(2);
    expect(etCounts[0].label).toBe("Server.count");
    expect(etCounts[0].currentValue).toBe(1);
    expect(etCounts[1].label).toBe("Customer.count");
  });

  test("returns queue capacity params", () => {
    const params = enumerateSweepableParams(basicModel);
    const caps = params.filter(p => p.type === "queueCapacity");
    expect(caps.length).toBe(2);
    expect(caps[0].label).toBe("Customer.capacity");
    expect(caps[0].currentValue).toBe(10);
    expect(caps[1].currentValue).toBe(Infinity);
  });

  test("returns B-Event distribution params", () => {
    const params = enumerateSweepableParams(basicModel);
    const bDist = params.filter(p => p.type === "bEventDistParam");
    expect(bDist.length).toBe(1);
    expect(bDist[0].label).toBe("Arrival.Exponential.mean");
    expect(bDist[0].currentValue).toBeCloseTo(1.111);
  });

  test("returns C-Event distribution params", () => {
    const params = enumerateSweepableParams(basicModel);
    const cDist = params.filter(p => p.type === "cEventDistParam");
    expect(cDist.length).toBe(1);
    expect(cDist[0].label).toBe("Seize.Exponential.mean");
  });

  test("returns state variable initial values", () => {
    const params = enumerateSweepableParams(basicModel);
    const svs = params.filter(p => p.type === "stateVarInit");
    expect(svs.length).toBe(1);
    expect(svs[0].label).toBe("threshold.initialValue");
  });

  test("handles model with no entity types gracefully", () => {
    const params = enumerateSweepableParams({});
    expect(Array.isArray(params)).toBe(true);
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
});

describe("M/M/1 template sweep", () => {
  test("enumerateSweepableParams returns expected params for M/M/1", () => {
    const mm1 = TEMPLATES.find(t => t.name === "M/M/1 Queue");
    expect(mm1).toBeDefined();
    const params = enumerateSweepableParams(mm1);
    // Server.count, Customer.count, Customer queue capacity, Arrival mean, Complete (no schedules), Seize mean
    const labels = params.map(p => p.label);
    expect(labels).toContain("Server.count");
    expect(labels).toContain("Arrival.Exponential.mean");
    expect(labels).toContain("Seize.Exponential.mean");
  });

  test("applying Server count 2 produces valid model structure", () => {
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
