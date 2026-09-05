import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SampledParamRangeList, SampledResultsTable, SensitivityPanel } from "../../../src/ui/execute/StudyPlanViews.jsx";

const sweepParams = [
  { path: "entityTypes.et1.count", label: "Number of Server", type: "entityTypeCount", currentValue: 1 },
  { path: "bEvents.b1.schedules.distParams.mean", label: "Arrival — mean", type: "bEventDistParam", currentValue: 2 },
];

describe("SampledParamRangeList", () => {
  it("renders an 'Add parameter' picker with no parameters added", () => {
    render(
      <SampledParamRangeList sampledParams={[]} setSampledParams={vi.fn()} sweepParams={sweepParams}
        pickerOpen={false} setPickerOpen={vi.fn()} />
    );
    expect(screen.getByText("+ Add parameter")).toBeTruthy();
  });

  it("renders a min/max input pair per added parameter", () => {
    const sampledParams = [{ ...sweepParams[0], min: 1, max: 5 }];
    render(
      <SampledParamRangeList sampledParams={sampledParams} setSampledParams={vi.fn()} sweepParams={sweepParams}
        pickerOpen={false} setPickerOpen={vi.fn()} />
    );
    expect(screen.getByLabelText("Number of Server minimum")).toBeTruthy();
    expect(screen.getByLabelText("Number of Server maximum")).toBeTruthy();
  });

  it("adds a parameter from the picker with a default range around its current value", () => {
    const setSampledParams = vi.fn();
    render(
      <SampledParamRangeList sampledParams={[]} setSampledParams={setSampledParams} sweepParams={sweepParams}
        pickerOpen setPickerOpen={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Number of Server"));
    expect(setSampledParams).toHaveBeenCalled();
    const updater = setSampledParams.mock.calls[0][0];
    const result = updater([]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("entityTypes.et1.count");
    expect(result[0].min).toBe(1);
    expect(result[0].max).toBe(3);
  });

  it("removes a parameter when its × button is clicked", () => {
    const sampledParams = [{ ...sweepParams[0], min: 1, max: 5 }];
    const setSampledParams = vi.fn();
    render(
      <SampledParamRangeList sampledParams={sampledParams} setSampledParams={setSampledParams} sweepParams={sweepParams}
        pickerOpen={false} setPickerOpen={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText("Remove Number of Server"));
    const updater = setSampledParams.mock.calls[0][0];
    expect(updater(sampledParams)).toEqual([]);
  });
});

describe("SampledResultsTable", () => {
  const parameters = [sweepParams[0], sweepParams[1]];
  const results = [
    { params: [{ path: parameters[0].path, value: 1 }, { path: parameters[1].path, value: 2 }], aggregateStats: { "summary.avgWait": { mean: 10 } } },
    { params: [{ path: parameters[0].path, value: 3 }, { path: parameters[1].path, value: 1 }], aggregateStats: { "summary.avgWait": { mean: 2 } } },
  ];

  it("renders nothing when there are no results", () => {
    const { container } = render(
      <SampledResultsTable results={[]} parameters={parameters} objectiveMetric="summary.avgWait" />
    );
    expect(container.textContent).toBe("");
  });

  it("renders one row per point and marks the best (lowest, for direction 'min') row", () => {
    render(
      <SampledResultsTable results={results} parameters={parameters} objectiveMetric="summary.avgWait" objectiveDirection="min" />
    );
    expect(screen.getByText(/POINTS \(2\)/)).toBeTruthy();
    expect(screen.getByText("BEST")).toBeTruthy();
    // The lowest-mean point (2) is best for "min" — its row should include "2".
    const bestRow = screen.getByText("BEST").closest("tr");
    expect(bestRow.textContent).toContain("2");
  });

  it("marks infeasible rows using the supplied evaluateFeasible callback", () => {
    const goals = [{ id: "g1", metric: "summary.avgWait", operator: "<", target: 5 }];
    render(
      <SampledResultsTable results={results} parameters={parameters} objectiveMetric="summary.avgWait"
        goals={goals} evaluateFeasible={stats => (stats["summary.avgWait"]?.mean ?? Infinity) < 5} />
    );
    // One point (mean 10) misses the goal, one (mean 2) meets it.
    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.getByText("✗")).toBeTruthy();
  });
});

describe("SensitivityPanel", () => {
  it("renders nothing when the ranking is empty", () => {
    const { container } = render(<SensitivityPanel method="some method" ranking={[]} />);
    expect(container.textContent).toBe("");
  });

  it("renders each parameter's label, correlation, and the method sentence", () => {
    render(
      <SensitivityPanel
        method="Pearson correlation between each parameter and the objective."
        ranking={[
          { path: "a", label: "Server count", correlation: -0.92, sampleSize: 10 },
          { path: "b", label: "Arrival mean", correlation: null, sampleSize: 10 },
        ]}
      />
    );
    expect(screen.getByText("Server count")).toBeTruthy();
    expect(screen.getByText("-0.92")).toBeTruthy();
    expect(screen.getByText("Arrival mean")).toBeTruthy();
    expect(screen.getByText("no signal")).toBeTruthy();
    expect(screen.getByText(/Pearson correlation between each parameter/)).toBeTruthy();
  });
});
