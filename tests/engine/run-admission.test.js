import { describe, expect, it } from "vitest";
import { getRunAdmission } from "../../src/engine/run-admission.js";

const baseModel = {
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

function cleanComplexity(overrides = {}) {
  return {
    plannedArrivals: 0,
    plannedScheduleRows: 0,
    expectedEntities: 10,
    bEventCount: 1,
    cEventCount: 1,
    estimatedStageTransitions: 10,
    estimatedCEventScans: 100,
    replications: 1,
    totalEstimatedEntities: 10,
    totalEstimatedScans: 100,
    riskLevel: "small",
    bottlenecks: [],
    confidence: "high",
    assumptions: [],
    unknowns: [],
    ...overrides,
  };
}

function getAdmission(overrides = {}) {
  return getRunAdmission(baseModel, {
    plan: "pro",
    warmupPeriod: 0,
    maxSimTime: 100,
    terminationMode: "time",
    terminationCondition: null,
    replications: 1,
    collectTimeSeries: true,
    validation: { errors: [], warnings: [] },
    modelCheckIssues: [],
    complexityEstimate: cleanComplexity(),
    ...overrides,
  });
}

describe("getRunAdmission", () => {
  it("blocks replication counts above the tier limit", () => {
    const result = getAdmission({ replications: 31 });

    expect(result.hardErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA3" }),
    ]));
    expect(result.effectiveSettings.allowRun).toBe(false);
  });

  it("classifies planned schedule rows near the tier limit as warning plus confirmation", () => {
    const result = getAdmission({
      complexityEstimate: cleanComplexity({ plannedScheduleRows: 8500 }),
    });

    expect(result.hardErrors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA5" }),
    ]));
    expect(result.confirmations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA6" }),
    ]));
  });

  it("blocks planned schedule rows above the tier limit", () => {
    const result = getAdmission({
      complexityEstimate: cleanComplexity({ plannedScheduleRows: 10001 }),
    });

    expect(result.hardErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA4" }),
    ]));
  });

  it("uses real planned-row counting from the model when applying admission policy", () => {
    const model = {
      ...baseModel,
      bEvents: [
        {
          id: "b1",
          name: "Scheduled arrival",
          effect: "ARRIVE(Customer)",
          schedules: [
            {
              eventId: "b1",
              dist: "Schedule",
              distParams: {
                rows: Array.from({ length: 2001 }, (_, index) => ({ time: index })),
              },
            },
          ],
        },
      ],
    };

    const result = getRunAdmission(model, {
      plan: "free",
      warmupPeriod: 0,
      maxSimTime: 100,
      terminationMode: "time",
      terminationCondition: null,
      replications: 1,
      collectTimeSeries: true,
      validation: { errors: [], warnings: [] },
      modelCheckIssues: [],
    });

    expect(result.complexityEstimate.plannedScheduleRows).toBe(2001);
    expect(result.hardErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "RA4",
        message: expect.stringMatching(/planned schedule rows exceed the free tier limit of 2,000/i),
      }),
    ]));
  });

  it("classifies scan volume near the tier limit as warning plus confirmation", () => {
    const result = getAdmission({
      complexityEstimate: cleanComplexity({ estimatedCEventScans: 210000 }),
    });

    expect(result.hardErrors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA8" }),
    ]));
    expect(result.confirmations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA9" }),
    ]));
  });

  it("auto-disables chart data for large allowed runs", () => {
    const result = getAdmission({
      replications: 2,
      complexityEstimate: cleanComplexity({
        expectedEntities: 12000,
        totalEstimatedEntities: 24000,
        totalEstimatedScans: 24000,
        riskLevel: "large",
      }),
    });

    expect(result.hardErrors).toEqual([]);
    expect(result.effectiveSettings.collectTimeSeries).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RA13" }),
    ]));
  });

  it("leaves the user's chart-data choice unchanged for small runs", () => {
    const enabled = getAdmission({
      collectTimeSeries: true,
      complexityEstimate: cleanComplexity({ riskLevel: "small" }),
    });
    const disabled = getAdmission({
      collectTimeSeries: false,
      complexityEstimate: cleanComplexity({ riskLevel: "small" }),
    });

    expect(enabled.effectiveSettings.collectTimeSeries).toBe(true);
    expect(disabled.effectiveSettings.collectTimeSeries).toBe(false);
  });
});
