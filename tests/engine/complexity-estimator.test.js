import { describe, expect, it } from "vitest";
import { countPlannedScheduleRows, estimateRunComplexity } from "../../src/engine/complexity-estimator.js";
import { TEMPLATES } from "../../src/engine/templates.js";

function getTemplate(id) {
  return TEMPLATES.find(template => template.id === id);
}

// ─── ADR-016 schedule format helpers ─────────────────────────────────────────

function makeAdr016InlineBEvent(id, rows) {
  return {
    id,
    name: id,
    effect: "ARRIVE(Customer)",
    schedules: [{ eventId: id, dist: "Schedule", rows }],
  };
}

function makeAdr016ExternalBEvent(id, scheduleRef) {
  return {
    id,
    name: id,
    effect: "ARRIVE(Customer)",
    schedules: [{ eventId: id, dist: "Schedule", scheduleRef, rows: [] }],
  };
}

describe("countPlannedScheduleRows — ADR-016 formats", () => {
  it("counts top-level inline rows (ADR-016 inline format)", () => {
    const model = {
      bEvents: [makeAdr016InlineBEvent("b1", [{ time: 10, attrs: {} }, { time: 20, attrs: {} }, { time: 30, attrs: {} }])],
      cEvents: [],
    };
    expect(countPlannedScheduleRows(model)).toBe(3);
  });

  it("counts external rows via schedulesMap (ADR-016 external format)", () => {
    const scheduleRef = "uuid-sched-1";
    const model = {
      bEvents: [makeAdr016ExternalBEvent("b1", scheduleRef)],
      cEvents: [],
    };
    const schedulesMap = { [scheduleRef]: { eventId: "b1", rows: [{ time: 5 }, { time: 10 }, { time: 15 }, { time: 20 }] } };
    expect(countPlannedScheduleRows(model, schedulesMap)).toBe(4);
  });

  it("returns 0 for an external scheduleRef not present in schedulesMap", () => {
    const model = {
      bEvents: [makeAdr016ExternalBEvent("b1", "missing-ref")],
      cEvents: [],
    };
    expect(countPlannedScheduleRows(model, {})).toBe(0);
  });

  it("prefers external rows over top-level rows when scheduleRef is set", () => {
    const scheduleRef = "uuid-external";
    const model = {
      bEvents: [{
        id: "b1",
        name: "b1",
        effect: "ARRIVE(Customer)",
        schedules: [{ eventId: "b1", dist: "Schedule", scheduleRef, rows: [{ time: 1 }] }],
      }],
      cEvents: [],
    };
    const schedulesMap = { [scheduleRef]: { eventId: "b1", rows: [{ time: 5 }, { time: 10 }] } };
    // scheduleRef takes priority — 2 external rows, not 1 inline
    expect(countPlannedScheduleRows(model, schedulesMap)).toBe(2);
  });

  it("sums across multiple bEvents with mixed formats", () => {
    const ref = "uuid-ext";
    const model = {
      bEvents: [
        makeAdr016InlineBEvent("b1", [{ time: 1 }, { time: 2 }]),
        makeAdr016ExternalBEvent("b2", ref),
      ],
      cEvents: [],
    };
    const schedulesMap = { [ref]: { eventId: "b2", rows: [{ time: 5 }, { time: 10 }, { time: 15 }] } };
    expect(countPlannedScheduleRows(model, schedulesMap)).toBe(5);
  });
});

describe("estimateRunComplexity — ADR-016 planned schedule models", () => {
  it("counts plannedArrivals from ADR-016 inline rows within sim horizon", () => {
    const model = {
      entityTypes: [],
      queues: [],
      bEvents: [makeAdr016InlineBEvent("b1", [{ time: 10 }, { time: 20 }, { time: 30 }, { time: 200 }])],
      cEvents: [],
    };
    const estimate = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: 100, replications: 1 });
    // times 10, 20, 30 are within 100; time 200 is not
    expect(estimate.plannedArrivals).toBe(4); // 1 initial + 3 within horizon
    expect(estimate.expectedEntities).toBe(4);
    expect(estimate.plannedScheduleRows).toBe(4);
  });

  it("counts plannedArrivals from external schedulesMap rows within sim horizon", () => {
    const ref = "uuid-ref";
    const model = {
      entityTypes: [],
      queues: [],
      bEvents: [makeAdr016ExternalBEvent("b1", ref)],
      cEvents: [],
    };
    const schedulesMap = { [ref]: { eventId: "b1", rows: [{ time: 5 }, { time: 15 }, { time: 50 }, { time: 150 }] } };
    const estimate = estimateRunComplexity(model, {
      terminationMode: "time",
      maxSimTime: 100,
      replications: 1,
      schedulesMap,
    });
    // times 5, 15, 50 are within 100; time 150 is not
    expect(estimate.plannedArrivals).toBe(4); // 1 initial + 3 within horizon
    expect(estimate.plannedScheduleRows).toBe(4);
  });

  it("populates arrivalRateByQueue for timetable models (enables bottleneck detection)", () => {
    const model = {
      entityTypes: [{ id: "srv", name: "Server", role: "server", count: "1" }],
      queues: [{ name: "MainQ" }],
      bEvents: [makeAdr016InlineBEvent("b1", [{ time: 10 }, { time: 20 }, { time: 30 }, { time: 40 }, { time: 50 }])],
      cEvents: [{
        id: "c1",
        name: "Service",
        effect: "ASSIGN(MainQ, Server)",
        cSchedules: [{ dist: "Fixed", distParams: { value: "8" } }],
      }],
    };
    const estimate = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: 100, replications: 1 });
    // 5 rows within horizon → arrivalRate = 5/100 = 0.05 per time unit
    // service capacity = 1/8 = 0.125 → utilisation = 0.05/0.125 = 0.4 → no bottleneck
    expect(estimate.bottlenecks).toHaveLength(0);
  });

  it("flags bottleneck when timetable arrivals saturate service capacity", () => {
    // ARRIVE(Customer) → queueName key = args[0] = "Customer"
    // ASSIGN(Customer, Server) → queueName = args[0] = "Customer" — same key, so bottleneck detected
    const model = {
      entityTypes: [{ id: "srv", name: "Server", role: "server", count: "1" }],
      queues: [{ name: "Customer" }],
      bEvents: [makeAdr016InlineBEvent("b1",
        Array.from({ length: 90 }, (_, i) => ({ time: i + 1 })) // 90 arrivals in 100 time units
      )],
      cEvents: [{
        id: "c1",
        name: "Service",
        effect: "ASSIGN(Customer, Server)",
        cSchedules: [{ dist: "Fixed", distParams: { value: "1" } }],
      }],
    };
    const estimate = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: 100, replications: 1 });
    // arrivalRate = 90/100 = 0.9; service capacity = 1/1 = 1.0 → utilisation = 0.9 → bottleneck
    expect(estimate.bottlenecks).toHaveLength(1);
    expect(estimate.bottlenecks[0].queueName).toBe("Customer");
    expect(estimate.bottlenecks[0].utilisationEstimate).toBe(0.9);
  });

  it("classifies risk as medium when plannedScheduleRows exceeds 1000", () => {
    const rows = Array.from({ length: 1100 }, (_, i) => ({ time: i * 1 }));
    const model = {
      entityTypes: [],
      queues: [],
      bEvents: [makeAdr016InlineBEvent("b1", rows)],
      cEvents: [],
    };
    const estimate = estimateRunComplexity(model, { terminationMode: "time", maxSimTime: 2000, replications: 1 });
    expect(estimate.plannedScheduleRows).toBe(1100);
    expect(["medium", "large", "too_large"]).toContain(estimate.riskLevel);
  });
});

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
