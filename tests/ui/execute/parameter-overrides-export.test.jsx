// Results exports must state the parameter values a run used when they differ
// from the saved model — otherwise an overridden run reads as a baseline run.
import { describe, expect, it, vi } from "vitest";

const downloadWorkbook = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../src/ui/shared/workbook.js", () => ({ downloadWorkbook }));

import { render, screen } from "@testing-library/react";
import { buildParameterOverrideRecord, buildResultsExportPayload, buildResultsXlsx } from "../../../src/ui/execute/executeHelpers.js";
import { buildLLMBundle } from "../../../src/llm/bundleExport.js";
import { buildKpis } from "../../../src/llm/prompts.js";
import { ResultsWorkspace } from "../../../src/ui/results/ResultsWorkspace.jsx";

const overrides = [{
  path: "stateVariables.closureEnabled.initialValue", label: "closureEnabled — starting value",
  type: "stateVarInit", targetId: "closureEnabled", baseValue: 0, value: 1, source: "adhoc",
}];
const results = { summary: { served: 5, total: 6 }, _experiment_config: { replications: 1, parameterOverrides: overrides } };

describe("buildParameterOverrideRecord", () => {
  it("records base value, value used and source", () => {
    const rec = buildParameterOverrideRecord([
      { paramConfig: { path: "a", label: "A", type: "stateVarInit", targetId: "A", currentValue: 0 }, value: 1 },
      { paramConfig: { path: "b", label: "B", type: "queueCapacity", targetId: "q", currentValue: Infinity }, value: 5 },
    ], new Set(["a"]));
    expect(rec).toEqual([
      { path: "a", label: "A", type: "stateVarInit", targetId: "A", baseValue: 0, value: 1, source: "adhoc" },
      { path: "b", label: "B", type: "queueCapacity", targetId: "q", baseValue: null, value: 5, source: "experiment" },
    ]);
  });

  it("is empty for a baseline run", () => {
    expect(buildParameterOverrideRecord([])).toEqual([]);
  });
});

describe("exports carry parameter overrides", () => {
  it("JSON export lists them under experiment.parameterOverrides", () => {
    const payload = buildResultsExportPayload({ model: { name: "Oil" }, results });
    expect(payload.experiment.parameterOverrides).toEqual(overrides);
  });

  it("JSON export shows an empty list for a baseline run", () => {
    const payload = buildResultsExportPayload({ model: { name: "Oil" }, results: { summary: {} } });
    expect(payload.experiment.parameterOverrides).toEqual([]);
  });

  it("workbook gets a Parameter Overrides sheet and a Summary row", async () => {
    await buildResultsXlsx({ results, model: { name: "Oil" } });
    const sheets = downloadWorkbook.mock.calls.at(-1)[0];
    expect(sheets.find(s => s.name === "Parameter Overrides").rows).toContainEqual(
      ["closureEnabled — starting value", "stateVariables.closureEnabled.initialValue", 0, 1, "adhoc"],
    );
    expect(sheets.find(s => s.name === "Summary").rows).toContainEqual(["Parameter Overrides", "1 — see Parameter Overrides sheet"]);
  });

  it("LLM export pack lists them in Experiment Configuration", () => {
    const md = buildLLMBundle({ name: "Oil" }, results, { replications: 1, parameterOverrides: overrides });
    expect(md).toContain("### Parameter Overrides");
    expect(md).toContain("| closureEnabled — starting value | 0 | 1 | Run tab adjustment |");
  });

  it("LLM export pack says so for a baseline run", () => {
    const md = buildLLMBundle({ name: "Oil" }, { summary: {} }, { replications: 1 });
    expect(md).toContain("| Parameter overrides | None — model run as saved |");
  });

  it("AI prompt KPIs include them", () => {
    expect(buildKpis({}, results).parameterOverrides).toEqual([
      { parameter: "closureEnabled — starting value", modelValue: 0, valueUsed: 1 },
    ]);
  });

  it("Results tab shows a note naming each override", () => {
    render(<ResultsWorkspace results={results} model={{ queues: [], entityTypes: [] }} />);
    const note = screen.getByRole("note", { name: "Parameter overrides" });
    expect(note.textContent).toContain("Run with 1 parameter override");
    expect(note.textContent).toContain("closureEnabled — starting value");
  });
});

describe("batch container levels are labelled", () => {
  const batchContainers = {
    summary: { containerLevels: { ct_asia_backlog: { min: 3, max: 120, avg: 40, final: 30, lowestMin: 0, highestMax: 245, aggregation: "mean-of-replications", replications: 10 } } },
  };

  it("LLM export pack names the rule and shows the extremes separately", () => {
    const md = buildLLMBundle({ name: "Oil" }, batchContainers, { replications: 10 });
    expect(md).toContain("**mean across replications**");
    expect(md).toContain("| ct_asia_backlog | 3.00 | 40.00 | 120.00 | 30.00 | 0.00 | 245.00 |");
  });

  it("Results tab labels mean values and shows the replication extremes", () => {
    render(<ResultsWorkspace results={batchContainers} model={{ queues: [], entityTypes: [], containerTypes: [{ id: "ct_asia_backlog" }] }} />);
    expect(screen.getByText(/each the mean across 10 replications/)).toBeTruthy();
    const extremes = screen.getByLabelText("ct_asia_backlog replication extremes");
    expect(extremes.textContent).toContain("Highest in any rep 245");
  });
});

describe("goal outcomes in exports", () => {
  const goalModel = { name: "Oil", goals: [
    { label: "Served at least 5", metric: "summary.served", operator: ">=", target: 5 },
    { label: "Avg wait under 1", metric: "summary.avgWait", operator: "<", target: 1 },
    { label: "Unmeasured", metric: "summary.totalCost", operator: "<", target: 1 },
  ] };
  const res = { summary: { served: 8, avgWait: 2.5 } };

  it("JSON export evaluates goals for results that predate recorded outcomes", () => {
    const payload = buildResultsExportPayload({ model: goalModel, results: res });
    expect(payload.results.goalOutcomes.map(g => [g.label, g.status])).toEqual([
      ["Served at least 5", "met"], ["Avg wait under 1", "not-met"], ["Unmeasured", "no-data"],
    ]);
  });

  it("metrics-only JSON export keeps goal outcomes", () => {
    const payload = buildResultsExportPayload({ model: goalModel, results: res, metricsOnly: true });
    expect(payload.results.goalOutcomes).toHaveLength(3);
  });

  it("prefers outcomes recorded at run time", () => {
    const recorded = [{ label: "x", status: "met" }];
    const payload = buildResultsExportPayload({ model: goalModel, results: { ...res, goalOutcomes: recorded } });
    expect(payload.results.goalOutcomes).toEqual(recorded);
  });

  it("workbook gets a Goals sheet and a Summary row", async () => {
    await buildResultsXlsx({ results: res, model: goalModel });
    const sheets = downloadWorkbook.mock.calls.at(-1)[0];
    expect(sheets.find(s => s.name === "Summary").rows).toContainEqual(["Goals met", "1 of 3 — see Goals sheet"]);
    expect(sheets.find(s => s.name === "Goals").rows).toContainEqual(["Avg wait under 1", "summary.avgWait", "", "<", 1, 2.5, 1.5, "not-met"]);
  });
});

describe("quantity (B1) in exports", () => {
  const qtyResults = { summary: {
    served: 30, servedQuantity: 37, quantityInSystem: 2, quantityAttrs: { Cargo: "volume" },
    quantityThroughByQueue: { "Berth Queue": 37 },
    perResource: { Terminal: { total: 1, utilisation: 0.5, quantityProcessed: 37 } },
    outcomes: { done: { routeId: "done", routeLabel: "Loaded", count: 30, quantity: 37 } },
  } };

  it("AI KPIs carry a quantity block", () => {
    const q = buildKpis({}, qtyResults).quantity;
    expect(q.served).toBe(37);
    expect(q.throughByQueue).toEqual({ "Berth Queue": 37 });
    expect(q.processedByResource).toEqual({ Terminal: 37 });
  });

  it("LLM export pack has a Quantities section", () => {
    const md = buildLLMBundle({ name: "Oil" }, qtyResults, { replications: 1 });
    expect(md).toContain("### Quantities");
    expect(md).toContain("Cargo.volume");
    expect(md).toContain("| Served | 37.00 |");
    expect(md).toContain("| Berth Queue | 37.00 |");
    expect(md).toContain("| Terminal | 37.00 |");
  });

  it("workbook gets Summary rows and a Quantities sheet", async () => {
    await buildResultsXlsx({ results: qtyResults, model: { name: "Oil" } });
    const sheets = downloadWorkbook.mock.calls.at(-1)[0];
    expect(sheets.find(s => s.name === "Summary").rows).toContainEqual(["Quantity Served", 37]);
    const q = sheets.find(s => s.name === "Quantities").rows;
    expect(q).toContainEqual(["Queue (through)", "Berth Queue", 37]);
    expect(q).toContainEqual(["Resource (processed)", "Terminal", 37]);
    expect(q).toContainEqual(["Outcome", "Loaded", 37]);
  });

  it("Results summary shows quantity cards", () => {
    render(<ResultsWorkspace results={qtyResults} model={{ queues: [], entityTypes: [] }} />);
    expect(screen.getByText("QUANTITY SERVED")).toBeTruthy();
    expect(screen.getByText("sum of volume")).toBeTruthy();
    expect(screen.getByText(/Quantity processed: 37/)).toBeTruthy();
  });

  it("no quantity output for models without quantityAttr", () => {
    expect(buildKpis({}, { summary: { served: 3 } }).quantity).toBeUndefined();
    expect(buildLLMBundle({ name: "x" }, { summary: { served: 3 } }, {})).not.toContain("### Quantities");
  });
});

describe("activity throughput shows firings when they differ (DELAY)", () => {
  it("notes the firing count under the entities-started figure", () => {
    const results = { summary: { activityCounts: {
      ret: { name: "Return to Hormuz", count: 106, firings: 4 },
      load: { name: "Load", count: 50, firings: 50 },
    } } };
    render(<ResultsWorkspace results={results} model={{ queues: [], entityTypes: [] }} />);
    expect(screen.getByText(/from 4 firings/)).toBeTruthy();
    expect(screen.queryByText(/from 50 firings/)).toBeNull();
  });
});
