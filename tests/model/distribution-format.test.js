import { describe, expect, it } from "vitest";
import { formatDistributionLabel } from "../../src/model/distributionFormat.js";

describe("formatDistributionLabel", () => {
  it("returns null for an empty or missing schedules array", () => {
    expect(formatDistributionLabel([])).toBeNull();
    expect(formatDistributionLabel(undefined)).toBeNull();
  });

  it("returns null when no row declares a distribution", () => {
    expect(formatDistributionLabel([{ eventId: "x" }, { eventId: "y" }])).toBeNull();
  });

  it("skips rows without a distribution and uses the first one that has it", () => {
    expect(formatDistributionLabel([
      { eventId: "x" },
      { dist: "Fixed", distParams: { value: 5 } },
    ])).toBe("Fixed(5)");
  });

  it("formats each known distribution type", () => {
    expect(formatDistributionLabel([{ dist: "Exponential", distParams: { rate: 0.5 } }])).toBe("Exp(λ=0.5)");
    expect(formatDistributionLabel([{ dist: "Uniform", distParams: { min: 1, max: 3 } }])).toBe("U(1, 3)");
    expect(formatDistributionLabel([{ dist: "Normal", distParams: { mean: 5, stdDev: 1 } }])).toBe("N(μ=5, σ=1)");
    expect(formatDistributionLabel([{ dist: "Fixed", distParams: { value: 5 } }])).toBe("Fixed(5)");
    expect(formatDistributionLabel([{ dist: "Triangular", distParams: { min: 1, mode: 2, max: 3 } }])).toBe("Tri(1, 2, 3)");
    expect(formatDistributionLabel([{ dist: "LogNormal", distParams: { logMean: 2 } }])).toBe("LogN(μ=2)");
    expect(formatDistributionLabel([{ dist: "Empirical", distParams: { values: [1, 2, 3] } }])).toBe("Empirical(n=3)");
  });

  it("is case-insensitive on the distribution type", () => {
    expect(formatDistributionLabel([{ dist: "exponential", distParams: { rate: 2 } }])).toBe("Exp(λ=2)");
  });

  it("falls back to a capitalized bare name for an unrecognized distribution type", () => {
    expect(formatDistributionLabel([{ dist: "weibull" }])).toBe("Weibull");
  });

  it("falls back to a short generic label when a known type has no params", () => {
    expect(formatDistributionLabel([{ dist: "Exponential" }])).toBe("Exp");
    expect(formatDistributionLabel([{ dist: "Uniform" }])).toBe("Uniform");
  });

  it("reads params from distType/params/distribution key variants", () => {
    expect(formatDistributionLabel([{ distType: "Fixed", params: { value: 7 } }])).toBe("Fixed(7)");
    expect(formatDistributionLabel([{ distribution: { type: "Fixed", value: 7 } }])).toBe("Fixed(7)");
  });
});
