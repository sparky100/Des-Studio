import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SweepChart } from "../../../src/ui/execute/SweepViews.jsx";

// A small mean with a wide 95% CI (few replications) mathematically produces
// a negative lower bound — but a wait time can never actually be negative,
// so the chart's y-axis must not render or pad into negative territory.
const negativeLowerBoundResults = [
  { value: 1, aggregateStats: { "summary.avgWait": { mean: 0.5, lower: -2, upper: 3, n: 5 } } },
  { value: 2, aggregateStats: { "summary.avgWait": { mean: 1.0, lower: -1, upper: 4, n: 5 } } },
];

describe("SweepChart y-axis clamping", () => {
  it("clamps the y-axis floor at 0 for a non-negative metric (avgWait) even when the CI lower bound is negative", () => {
    const { container } = render(
      <SweepChart results={negativeLowerBoundResults} metric="summary.avgWait" paramLabel="Servers" />
    );

    const tickLabels = Array.from(container.querySelectorAll('text[font-family="monospace"]'))
      .map(el => el.textContent)
      .filter(text => /^-?\d/.test(text || ""));

    expect(tickLabels.length).toBeGreaterThan(0);
    for (const label of tickLabels) {
      expect(label.startsWith("-")).toBe(false);
    }
  });

  it("does not clamp a metric that can legitimately go negative (totalCost)", () => {
    const results = [
      { value: 1, aggregateStats: { "summary.totalCost": { mean: -5, lower: -12, upper: 2, n: 5 } } },
      { value: 2, aggregateStats: { "summary.totalCost": { mean: -3, lower: -9, upper: 3, n: 5 } } },
    ];
    const { container } = render(
      <SweepChart results={results} metric="summary.totalCost" paramLabel="Servers" />
    );

    const tickLabels = Array.from(container.querySelectorAll('text[font-family="monospace"]'))
      .map(el => el.textContent)
      .filter(text => /^-?\d/.test(text || ""));

    expect(tickLabels.some(label => label.startsWith("-"))).toBe(true);
  });
});
