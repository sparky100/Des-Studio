import { describe, expect, it } from "vitest";
import { countPlannedScheduleRows, estimateRunComplexity } from "../../src/engine/complexity-estimator.js";
import { TEMPLATES } from "../../src/engine/templates.js";

function getTemplate(id) {
  return TEMPLATES.find(template => template.id === id);
}

describe("estimateRunComplexity", () => {
  it("counts planned schedule rows and times exactly across B-events and C-events", () => {
    const model = {
      entityTypes: [],
      stateVariables: [],
      queues: [],
      bEvents: [
        {
          id: "b1",
          name: "Arrival plan",
          effect: "ARRIVE(Customer)",
          schedules: [
            {
              eventId: "b1",
              dist: "Schedule",
              distParams: {
                rows: [{ time: 1 }, { time: 2 }, { time: 3 }],
              },
            },
            {
              eventId: "b1",
              dist: "Schedule",
              distParams: {
                times: [4, 5],
              },
            },
            {
              eventId: "b1",
              dist: "Fixed",
              distParams: { value: 1 },
            },
          ],
        },
      ],
      cEvents: [
        {
          id: "c1",
          name: "Planned follow-up",
          effect: "ASSIGN(Main,Server)",
          cSchedules: [
            {
              eventId: "b2",
              dist: "Schedule",
              distParams: {
                rows: [{ time: 6 }],
                times: [7, 8],
              },
            },
          ],
        },
      ],
    };

    expect(countPlannedScheduleRows(model)).toBe(8);

    const estimate = estimateRunComplexity(model, {
      terminationMode: "time",
      maxSimTime: 10,
      replications: 1,
    });
    expect(estimate.plannedScheduleRows).toBe(8);
  });

  it("estimates recurring workload for the M/M/1 template from the run horizon", () => {
    const estimate = estimateRunComplexity(getTemplate("mm1"), {
      terminationMode: "time",
      maxSimTime: 500,
      replications: 1,
    });

    expect(estimate).toEqual(expect.objectContaining({
      plannedArrivals: 1,
      expectedEntities: 452,
      bEventCount: 2,
      cEventCount: 1,
      estimatedStageTransitions: 452,
      estimatedCEventScans: 904,
      riskLevel: "small",
      confidence: "high",
    }));
    expect(estimate.bottlenecks).toEqual([
      expect.objectContaining({
        queueName: "Customer",
        utilisationEstimate: 0.9,
      }),
    ]);
  });

  it("surfaces uncertainty for condition-based runs", () => {
    const estimate = estimateRunComplexity(getTemplate("data-center"), {
      terminationMode: "condition",
      replications: 3,
    });

    expect(estimate.confidence).toBe("low");
    expect(estimate.unknowns.join(" ")).toMatch(/condition/i);
    expect(estimate.replications).toBe(3);
  });
});
