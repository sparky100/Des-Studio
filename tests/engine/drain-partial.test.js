// C — DRAIN_PARTIAL(c, amount[, shortfallContainer]) removes min(level, amount)
// and records the remainder in the shortfall container. DRAIN is unchanged.
import { describe, test, expect, beforeEach } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { resetSeq } from "../../src/engine/entities.js";
import { validateModel } from "../../src/engine/validation.js";
import { renameContainer } from "../../src/engine/queue-refs.js";

beforeEach(() => { resetSeq(); });

// One B-event at t=1 runs `effect` against Stock (initial `level`) and Unmet (0).
function model(effect, level, { unmetCap } = {}) {
  return {
    entityTypes: [{ id: "x", name: "X", role: "customer", attrDefs: [] }],
    queues: [], stateVariables: [], cEvents: [],
    containerTypes: [
      { id: "Stock", capacity: 1000, initialLevel: level },
      { id: "Unmet", initialLevel: 0, ...(unmetCap ? { capacity: unmetCap } : {}) },
    ],
    bEvents: [{ id: "demand", name: "Demand", scheduledTime: "1", effect, schedules: [] }],
  };
}
const levels = (effect, level, opts) => {
  const c = buildEngine(model(effect, level, opts), 1, 0, 2).runAll().snap.containers;
  return { stock: c.Stock.level, unmet: c.Unmet.level };
};

describe("DRAIN_PARTIAL", () => {
  test("draws the full amount when there is enough", () => {
    expect(levels("DRAIN_PARTIAL(Stock, 4, Unmet)", 10)).toEqual({ stock: 6, unmet: 0 });
  });

  test("draws what is there and records the remainder as shortfall", () => {
    const r = levels("DRAIN_PARTIAL(Stock, 13.12, Unmet)", 5);
    expect(r.stock).toBe(0);
    expect(r.unmet).toBeCloseTo(8.12, 10);
  });

  test("an empty source records the whole amount as shortfall", () => {
    expect(levels("DRAIN_PARTIAL(Stock, 4, Unmet)", 0)).toEqual({ stock: 0, unmet: 4 });
  });

  test("without a shortfall container it just draws what it can", () => {
    expect(levels("DRAIN_PARTIAL(Stock, 4)", 3)).toEqual({ stock: 0, unmet: 0 });
  });

  test("shortfall respects the shortfall container's capacity", () => {
    expect(levels("DRAIN_PARTIAL(Stock, 10, Unmet)", 0, { unmetCap: 6 })).toEqual({ stock: 0, unmet: 6 });
  });

  test("DRAIN is unchanged: it does nothing below the amount", () => {
    expect(levels("DRAIN(Stock, 4)", 3)).toEqual({ stock: 3, unmet: 0 });
  });

  test("daily demand: unmet total = demand − stock available, with no remainder", () => {
    const m = model("", 30);
    m.bEvents = [{ id: "demand", name: "Demand", scheduledTime: "1", effect: "DRAIN_PARTIAL(Stock, 13.12, Unmet)",
      schedules: [{ eventId: "demand", dist: "Fixed", distParams: { value: "1" } }] }];
    const c = buildEngine(m, 1, 0, 10.5).runAll().snap.containers; // 10 demand days
    expect(c.Stock.level).toBe(0);
    expect(c.Unmet.level).toBeCloseTo(10 * 13.12 - 30, 8);
  });
});

describe("validation", () => {
  const v27 = effect => validateModel(model(effect, 1)).errors.filter(e => e.code === "V27");
  test("valid forms pass", () => {
    expect(v27("DRAIN_PARTIAL(Stock, 4, Unmet)")).toEqual([]);
    expect(v27("DRAIN_PARTIAL(Stock, 4)")).toEqual([]);
  });
  test("undeclared containers, same source/shortfall and non-positive amounts are blocking", () => {
    expect(v27("DRAIN_PARTIAL(Nope, 4, Unmet)")).toHaveLength(1);
    expect(v27("DRAIN_PARTIAL(Stock, 4, Nope)")).toHaveLength(1);
    expect(v27("DRAIN_PARTIAL(Stock, 4, Stock)")).toHaveLength(1);
    expect(v27("DRAIN_PARTIAL(Stock, 0, Unmet)")).toHaveLength(1);
  });
});

describe("container rename", () => {
  test("renames both the source and the shortfall container", () => {
    const m = model("DRAIN_PARTIAL(Stock, 4, Unmet)", 1);
    const renamed = renameContainer(renameContainer(m, "Stock", "Products"), "Unmet", "Lost");
    expect(renamed.bEvents[0].effect).toBe("DRAIN_PARTIAL(Products, 4, Lost)");
  });
});
