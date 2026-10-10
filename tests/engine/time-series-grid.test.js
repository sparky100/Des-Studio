// Grid sampling for batch charts (engine option timeSeriesGridPoints).
//
// Batch charts resample each replication's series onto N equal points
// (makeTimeSeriesAccumulator). With timeSeriesGridPoints = N the engine keeps
// only the samples that resampling reads — the last cycle at or before each
// grid point, carrying the waits/completions since the previous kept sample —
// so the batch chart and every other result are unchanged while a replication
// holds ~N points instead of one per cycle.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { TEMPLATES } from "../../src/engine/templates.js";
import { makeTimeSeriesAccumulator, TIME_SERIES_GRID_POINTS } from "../../src/ui/execute/executeHelpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fleet = JSON.parse(fs.readFileSync(path.join(here, "benchmarks", "fixtures", "oil-network-fleet.json"), "utf8")).model_json;
const template = id => { const t = TEMPLATES.find(x => x.id === id); return t.model || t; };

/** Deep equality with a relative tolerance on numbers (sums are regrouped). */
function expectClose(a, b, where = "") {
  if (typeof a === "number" && typeof b === "number") {
    expect(Math.abs(a - b), `${where}: ${a} vs ${b}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(a)));
    return;
  }
  if (a === null || b === null || typeof a !== "object") { expect(b, where).toBe(a); return; }
  expect(Object.keys(b), where).toEqual(Object.keys(a));
  for (const k of Object.keys(a)) expectClose(a[k], b[k], `${where}.${k}`);
}

const run = (model, T, warmup, grid) => buildEngine(model, 11, warmup, T, null, 1e7, 5000, true, undefined, {
  collectTrace: false,
  // Cross-check the engine's running counters against full scans every
  // cycle (slow — skipped for the 903-server fleet model).
  _verifyInSystemCounter: model !== fleet,
  ...(grid ? { timeSeriesGridPoints: TIME_SERIES_GRID_POINTS } : {}),
}).runAll();

const chartOf = (result, T) => {
  const acc = makeTimeSeriesAccumulator(TIME_SERIES_GRID_POINTS, T);
  acc.addSeries(result.timeSeries);
  return acc.getResult();
};

const everythingButTheSeries = r => JSON.parse(JSON.stringify({
  ...r, timeSeries: undefined, runtimeMetrics: { ...r.runtimeMetrics, wall_clock_ms: undefined },
}));

describe("timeSeriesGridPoints", () => {
  const cases = [
    ["mm1", template("mm1"), 480, 0],
    ["er-triage", template("er-triage"), 480, 5],
    ["fast-food", template("fast-food"), 480, 0],
    ["airport", template("airport"), 480, 5],
    ["construction", template("construction"), 480, 0],
    ["order-fulfillment", template("order-fulfillment"), 480, 0],
    ["machine-shop-failures", template("machine-shop-failures"), 480, 5],
    ["priority-ed-balking", template("priority-ed-balking"), 480, 0],
    ["tanker fleet", fleet, 90, 30],
  ];

  for (const [name, model, T, warmup] of cases) {
    it(`${name}: same batch chart and results with ≤ ${TIME_SERIES_GRID_POINTS} samples`, () => {
      const perCycle = run(model, T, warmup, false);
      const grid = run(model, T, warmup, true);
      expect(grid.timeSeries.length).toBeLessThanOrEqual(TIME_SERIES_GRID_POINTS);
      expectClose(chartOf(perCycle, T), chartOf(grid, T), "chart");
      expect(everythingButTheSeries(grid)).toEqual(everythingButTheSeries(perCycle));
    });
  }

  it("keeps one sample per cycle when there is no fixed run length", () => {
    const m = template("mm1");
    const stop = { variable: "served", operator: ">=", value: 40 };
    const runWith = opts => buildEngine(m, 11, 0, null, stop, 1e7, 5000, true, undefined, { collectTrace: false, ...opts }).runAll();
    expect(runWith({ timeSeriesGridPoints: TIME_SERIES_GRID_POINTS }).timeSeries).toEqual(runWith({}).timeSeries);
  });
});

describe("queue waits in chart samples", () => {
  // One job: Q1 (1 unit) then Q2. When it leaves Q1 nothing references Q1 any
  // more — its wait used to be dropped from the sample because Q1 had no
  // byQueue entry at that moment.
  it("records the wait of a queue the last entity has just left", () => {
    const fix = v => ({ dist: "Fixed", distParams: { value: String(v) } });
    const model = {
      entityTypes: [{ id: "j", name: "Job", role: "customer", count: 0, attrDefs: [] },
        { id: "a", name: "A", role: "server", count: 1, attrDefs: [] }, { id: "b", name: "B", role: "server", count: 1, attrDefs: [] }],
      queues: [{ id: "q1", name: "Q1" }, { id: "q2", name: "Q2" }], stateVariables: [],
      bEvents: [
        { id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Job, Q1)", schedules: [] },
        { id: "doneA", name: "Done A", scheduledTime: "9999", effect: "RELEASE(A, Q2)", schedules: [] },
        { id: "doneB", name: "Done B", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "sa", name: "Serve A", priority: 1, effect: "ASSIGN(Q1, A)", condition: "queue(Q1).length > 0 AND idle(A).count > 0", cSchedules: [{ eventId: "doneA", ...fix(1), useEntityCtx: true }] },
        { id: "sb", name: "Serve B", priority: 2, effect: "ASSIGN(Q2, B)", condition: "queue(Q2).length > 0 AND idle(B).count > 0", cSchedules: [{ eventId: "doneB", ...fix(1), useEntityCtx: true }] },
      ],
    };
    const r = buildEngine(model, 1, 0, 10, null, 1e6, 5000, true, undefined, { collectTrace: false }).runAll();
    const waitsRecorded = queue => r.timeSeries.reduce((n, p) => n + (p.byQueue?.[queue]?.waitN || 0), 0);
    expect(waitsRecorded("Q1")).toBe(1);
    expect(waitsRecorded("Q2")).toBe(1);
  });
});
