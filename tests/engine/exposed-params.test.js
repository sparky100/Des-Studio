import { describe, expect, it } from "vitest";
import { resolveExposedParams, clampExposedValue } from "../../src/engine/exposed-params.js";

// Fixture model exercising the main sweepable-parameter families:
// plain server count, shift-scheduled server, queue capacity (incl. the
// unlimited/Infinity case), a B-event distribution parameter, and a state
// variable initial value.
const model = {
  timeUnit: "minutes",
  entityTypes: [
    { id: "et-teller", name: "Teller", role: "server", count: "2" },
    {
      id: "et-nurse", name: "Nurse", role: "server", count: "1",
      shiftSchedule: [
        { time: 0, capacity: "2" },
        { time: 240, capacity: "4" },
      ],
    },
    { id: "et-cust", name: "Customer", role: "customer", count: "0" },
  ],
  queues: [
    { id: "q-main", name: "Main Queue", customerType: "Customer", capacity: "10" },
    { id: "q-unlimited", name: "Overflow", customerType: "Customer", capacity: "" },
  ],
  bEvents: [
    { id: "b-arrive", name: "Arrival", schedules: [{ dist: "Exponential", distParams: { mean: "5" } }] },
  ],
  cEvents: [],
  stateVariables: [{ name: "threshold", initialValue: "10" }],
};

describe("resolveExposedParams", () => {
  it("returns empty results for a model with no exposedParams", () => {
    expect(resolveExposedParams({ ...model, exposedParams: [] })).toEqual({ resolved: [], orphans: [] });
    expect(resolveExposedParams(model)).toEqual({ resolved: [], orphans: [] });
  });

  it("resolves stored entries to full live paramConfigs across parameter families", () => {
    const { resolved, orphans } = resolveExposedParams({
      ...model,
      exposedParams: [
        { path: "entityTypes.et-teller.count", businessLabel: "Number of tellers", min: 1, max: 10 },
        { path: "entityTypes.et-nurse.shiftSchedule[1].capacity" },
        { path: "queues.q-main.capacity" },
        { path: "bEvents.b-arrive.schedules.distParams.mean" },
        { path: "stateVariables.threshold.initialValue" },
      ],
    });

    expect(orphans).toEqual([]);
    expect(resolved).toHaveLength(5);

    const teller = resolved[0];
    expect(teller.type).toBe("entityTypeCount");
    expect(teller.targetId).toBe("et-teller");
    expect(teller.currentValue).toBe(2);
    expect(teller.displayLabel).toBe("Number of tellers"); // businessLabel wins
    expect(teller.min).toBe(1);
    expect(teller.max).toBe(10);

    const shift = resolved[1];
    expect(shift.type).toBe("shiftCapacity");
    expect(shift.periodIndex).toBe(1);
    expect(shift.currentValue).toBe(4);
    expect(shift.displayLabel).toBe(shift.label); // no businessLabel — technical label fallback

    expect(resolved[2].type).toBe("queueCapacity");
    expect(resolved[3].type).toBe("bEventDistParam");
    expect(resolved[3].paramKey).toBe("mean");
    expect(resolved[4].type).toBe("stateVarInit");
  });

  it("re-derives currentValue at render time, including the non-JSON-safe Infinity case", () => {
    const { resolved } = resolveExposedParams({
      ...model,
      exposedParams: [{ path: "queues.q-unlimited.capacity", businessLabel: "Overflow size" }],
    });
    expect(resolved[0].currentValue).toBe(Infinity);
  });

  it("reports entries whose target no longer exists as orphans, preserving order of the rest", () => {
    const { resolved, orphans } = resolveExposedParams({
      ...model,
      exposedParams: [
        { path: "entityTypes.et-deleted.count", businessLabel: "Gone" },
        { path: "entityTypes.et-teller.count" },
        { path: "stateVariables.renamedVar.initialValue" },
      ],
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].targetId).toBe("et-teller");
    expect(orphans).toEqual([
      { path: "entityTypes.et-deleted.count", businessLabel: "Gone" },
      { path: "stateVariables.renamedVar.initialValue" },
    ]);
  });
});

describe("clampExposedValue", () => {
  it("clamps to min and max when both are set", () => {
    const entry = { type: "entityTypeCount", min: 1, max: 10 };
    expect(clampExposedValue(entry, 0)).toBe(1);
    expect(clampExposedValue(entry, 5)).toBe(5);
    expect(clampExposedValue(entry, 99)).toBe(10);
  });

  it("applies only the bound that is set", () => {
    expect(clampExposedValue({ type: "entityTypeCount", min: 2 }, 0)).toBe(2);
    expect(clampExposedValue({ type: "entityTypeCount", min: 2 }, 500)).toBe(500);
    expect(clampExposedValue({ type: "entityTypeCount", max: 3 }, 500)).toBe(3);
    expect(clampExposedValue({ type: "entityTypeCount" }, -5)).toBe(-5);
  });

  it("floors queueCapacity at 1 when the owner set no explicit min (0 would mean unlimited)", () => {
    expect(clampExposedValue({ type: "queueCapacity" }, 0)).toBe(1);
    expect(clampExposedValue({ type: "queueCapacity" }, -3)).toBe(1);
    expect(clampExposedValue({ type: "queueCapacity" }, 7)).toBe(7);
    // An explicit owner-set min overrides the implicit floor
    expect(clampExposedValue({ type: "queueCapacity", min: 5 }, 2)).toBe(5);
  });

  it("passes non-finite input through unchanged for the caller to reject", () => {
    expect(clampExposedValue({ type: "entityTypeCount", min: 1 }, NaN)).toBeNaN();
  });
});
