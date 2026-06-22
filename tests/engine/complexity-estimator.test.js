import { describe, expect, it } from "vitest";
import { countPlannedScheduleRows, estimateRunComplexity, estimateMaxCycles, computeEstimateAccuracy } from "../../src/engine/complexity-estimator.js";
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

  it("returns estimated B-event firings so high-volume runs get a scaled cycle cap", () => {
    const model = {
      entityTypes: [
        { id: "customer", name: "Customer", role: "customer", count: 0 },
        { id: "server_a", name: "Server A", role: "server", count: 10 },
        { id: "server_b", name: "Server B", role: "server", count: 10 },
        { id: "server_c", name: "Server C", role: "server", count: 10 },
      ],
      queues: [
        { name: "Entry Queue" },
        { name: "Middle Queue" },
        { name: "Exit Queue" },
      ],
      bEvents: [{
        id: "arrival",
        name: "Arrival",
        scheduledTime: "0",
        effect: "ARRIVE(Customer, Entry Queue)",
        schedules: [{
          eventId: "arrival",
          dist: "Exponential",
          distParams: { mean: "0.005" },
        }],
      }],
      cEvents: [
        {
          id: "stage_a",
          name: "Stage A",
          effect: "ASSIGN(Entry Queue, Server A)",
          cSchedules: [{ eventId: "done_a", dist: "Fixed", distParams: { value: "1" } }],
        },
        {
          id: "stage_b",
          name: "Stage B",
          effect: "ASSIGN(Middle Queue, Server B)",
          cSchedules: [{ eventId: "done_b", dist: "Fixed", distParams: { value: "1" } }],
        },
        {
          id: "stage_c",
          name: "Stage C",
          effect: "ASSIGN(Exit Queue, Server C)",
          cSchedules: [{ eventId: "done_c", dist: "Fixed", distParams: { value: "1" } }],
        },
      ],
    };

    const estimate = estimateRunComplexity(model, {
      terminationMode: "time",
      maxSimTime: 90,
      replications: 1,
    });

    expect(estimate.estimatedBEventFirings).toBe(72004);
    expect(estimate.estimatedCEventScans).toBe(216012);
    expect(estimateMaxCycles(estimate)).toBe(144008);
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

describe("estimateMaxCycles", () => {
  it("applies the floor for small/trivial models", () => {
    expect(estimateMaxCycles({ estimatedBEventFirings: 10 })).toBe(5000);
    expect(estimateMaxCycles(null)).toBe(5000);
    expect(estimateMaxCycles({})).toBe(5000);
  });

  it("scales with a 2x safety factor for a large model resembling the refugee-intake shape", () => {
    // ~90,000 estimated B-event firings, similar order of magnitude to the
    // 90-day refugee-intake crisis model that originally motivated this fix.
    const estimate = estimateMaxCycles({ estimatedBEventFirings: 90000 });
    expect(estimate).toBe(180000);
  });

  it("respects a custom floor/safetyFactor", () => {
    expect(estimateMaxCycles({ estimatedBEventFirings: 1000 }, { floor: 200, safetyFactor: 3 })).toBe(3000);
    expect(estimateMaxCycles({ estimatedBEventFirings: 10 }, { floor: 200, safetyFactor: 3 })).toBe(200);
  });

  it("clamps to the ceiling for pathologically large estimates", () => {
    expect(estimateMaxCycles({ estimatedBEventFirings: 10_000_000 })).toBe(5_000_000);
    expect(estimateMaxCycles({ estimatedBEventFirings: 1_000_000 }, { ceiling: 1_000_000 })).toBe(1_000_000);
  });
});

describe("computeEstimateAccuracy", () => {
  it("returns null when either input is missing", () => {
    expect(computeEstimateAccuracy(null, { c_event_scans: 10 })).toBeNull();
    expect(computeEstimateAccuracy({ estimatedCEventScans: 10 }, null)).toBeNull();
  });

  it("computes scans/entities ratios from estimate vs. real runtimeMetrics", () => {
    const accuracy = computeEstimateAccuracy(
      { estimatedCEventScans: 1000, expectedEntities: 100 },
      { c_event_scans: 1200, entities_created: 90 },
    );

    expect(accuracy).toEqual({
      scansEstimated: 1000,
      scansActual: 1200,
      scansRatio: 1.2,
      entitiesEstimated: 100,
      entitiesActual: 90,
      entitiesRatio: 0.9,
    });
  });

  it("returns null ratios when the corresponding estimate is zero (avoids divide-by-zero)", () => {
    const accuracy = computeEstimateAccuracy(
      { estimatedCEventScans: 0, expectedEntities: 0 },
      { c_event_scans: 50, entities_created: 5 },
    );

    expect(accuracy.scansRatio).toBeNull();
    expect(accuracy.entitiesRatio).toBeNull();
    expect(accuracy.scansActual).toBe(50);
    expect(accuracy.entitiesActual).toBe(5);
  });
});
