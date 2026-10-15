// Sprint 99 Phase 1 — interrupted service (PREEMPT, FAIL, breakdowns, shift
// changes) is correct and measured correctly.
//   1a  a stale completion from before an interruption never fires
//   1b  wait counts queue time only; service sums every service interval
//   1c  the remaining time is honoured for every service distribution
// See docs/reviews/sprint-99-preemption-plan.md.
import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";

const SERVE_CONDITION = {
  operator: "AND",
  clauses: [
    { variable: "queue(Q).length", operator: ">", value: 0 },
    { variable: "idle(Server).count", operator: ">", value: 0 },
  ],
};

/**
 * One server. A low-priority job (prio 2, 10 units) arrives at t=0; at `interruptAt` a
 * B-event fires `interruptEffect` (and, for PREEMPT, a high-priority 2-unit job arrives).
 * `inService` counts jobs in service: +1 on every ASSIGN, −1 on every completion and on the
 * preemption. It ends at 0 — a stale completion firing would take it to −1.
 */
function model({ interruptAt = 5, interruptEffect = ["ARRIVE(Job, Q)", "SET_ATTR(prio, 1)", "PREEMPT(Server)", "SET(inService, inService-1)"], extraBEvents = [], lowService = { dist: "Fixed", distParams: { value: "10" } } } = {}) {
  return {
    entityTypes: [
      { id: "j", name: "Job", role: "customer", count: 0, attrDefs: [
        { name: "prio", valueType: "number", defaultValue: 2, mutable: true },
        { name: "work", valueType: "number", defaultValue: 10, mutable: true },
      ] },
      { id: "s", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [{ name: "inService", initialValue: "0" }],
    queues: [{ id: "q", name: "Q", customerType: "Job", discipline: "PRIORITY(prio)" }],
    bEvents: [
      { id: "low", name: "Low arrives", scheduledTime: "0", effect: ["ARRIVE(Job, Q)", "SET_ATTR(prio, 2)"], schedules: [] },
      { id: "interrupt", name: "Interrupt", scheduledTime: String(interruptAt), effect: interruptEffect, schedules: [] },
      { id: "done_low", name: "Low done", scheduledTime: "9999", effect: ["COMPLETE()", "SET(inService, inService-1)"], schedules: [] },
      { id: "done_high", name: "High done", scheduledTime: "9999", effect: ["COMPLETE()", "SET(inService, inService-1)"], schedules: [] },
      ...extraBEvents,
    ],
    cEvents: [
      {
        id: "serve_high", name: "Serve high", priority: 1,
        condition: { operator: "AND", clauses: [...SERVE_CONDITION.clauses, { variable: "Entity.prio", operator: "==", value: 1 }] },
        effect: ["ASSIGN(Q, Server)"],
        cSchedules: [
          { eventId: "done_high", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true, when: { variable: "Entity.prio", operator: "==", value: 1 } },
          { eventId: "done_low", ...lowService, useEntityCtx: true },
        ],
      },
    ],
  };
}

// Every job goes through the one C-event; its cSchedules pick the completion by priority.
function fixSchedules(m) {
  m.cEvents[0].condition = SERVE_CONDITION;
  m.cEvents[0].effect = ["ASSIGN(Q, Server)", "SET(inService, inService+1)"];
  m.cEvents[0].cSchedules[0] = { ...m.cEvents[0].cSchedules[0] };
  return m;
}

const run = (m, maxTime = 40, warmup = 0) => buildEngine(fixSchedules(m), 1, warmup, maxTime).runAll();
const lowJob = r => r.entitySummary.find(e => e.role === "customer" && e.attrs?.prio === 2);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe("1a — a completion scheduled before an interruption never fires", () => {
  it("PREEMPT: the low job resumes and finishes at t=12, not at its stale t=10", () => {
    const r = run(model());
    const low = lowJob(r);
    expect(low.status).toBe("done");
    expect(low.completionTime).toBeCloseTo(12, 6);
    // The completion event's other effects ran once, not twice.
    expect(r.snap.scalars.inService).toBe(0);
    expect(r.log.some(l => /Skipped: "Low done" — #\d+ service was interrupted/.test(l.message || ""))).toBe(true);
  });

  it("FAIL / REPAIR: the job resumes after repair with its remaining time", () => {
    const r = run(model({
      interruptEffect: ["FAIL(Server)"],
      extraBEvents: [{ id: "fix", name: "Repair", scheduledTime: "6", effect: ["REPAIR(Server)"], schedules: [] }],
    }));
    const low = lowJob(r);
    expect(low.completionTime).toBeCloseTo(11, 6); // 5 done, down 5→6, 5 remaining
  });

  it("a stale firing is not counted as an activity completion", () => {
    const r = run(model());
    const fired = r.snap.eventCounts?.done_low;
    expect(typeof fired === "object" ? fired.count ?? fired.firings : fired).toBe(1);
  });
});

describe("1b — wait is queue time; service is every service interval", () => {
  it("records 2 units of wait and 10 of service, with one interruption", () => {
    const r = run(model());
    const low = lowJob(r);
    expect(low.stages).toHaveLength(1);
    const [stage] = low.stages;
    expect(stage.stageWait).toBeCloseTo(2, 6);
    expect(stage.stageService).toBeCloseTo(10, 6);
    expect(stage.interruptions).toBe(1);
    expect(stage.serviceSegments).toEqual([{ serviceStartedAt: 0, serviceEndedAt: 5 }]);
  });

  it("summary averages use the corrected figures", () => {
    const r = run(model());
    // High job: wait 0, service 2. Low job: wait 2, service 10.
    expect(r.summary.avgWait).toBeCloseTo(1, 6);
    expect(r.summary.avgSvc).toBeCloseTo(6, 6);
    // Time in system is unchanged by the bookkeeping: 2 + 12.
    expect(r.summary.avgSojourn).toBeCloseTo(7, 6);
  });

  it("warm-up truncation applies to each interval", () => {
    // Warm-up ends at t=3: 3 of the first 5 service units fall before it.
    const r = run(model(), 40, 3);
    const low = lowJob(r);
    expect(low.completionTime).toBeCloseTo(12, 6);
    // Post-warm-up: service 2 (3→5) + 5 (7→12) = 7; wait 2 (5→7).
    const served = r.entitySummary.filter(e => e.role === "customer" && e.status === "done");
    expect(served).toHaveLength(2);
    expect(r.summary.avgSvc).toBeCloseTo((7 + 2) / 2, 6);
    expect(r.summary.avgWait).toBeCloseTo((2 + 0) / 2, 6);
  });
});

describe("1c — remaining time is honoured for every service distribution", () => {
  it("EntityAttr service resumes with its remaining time, not the full attribute value", () => {
    const r = run(model({ lowService: { dist: "EntityAttr", distParams: { attr: "work" } } }));
    expect(lowJob(r).completionTime).toBeCloseTo(12, 6);
  });

  it("an interruption at the exact due time resumes with 0 remaining, not a fresh sample", () => {
    const r = run(model({ interruptAt: 10, interruptEffect: ["FAIL(Server)"], extraBEvents: [{ id: "fix", name: "Repair", scheduledTime: "10", effect: ["REPAIR(Server)"], schedules: [] }] }));
    const low = lowJob(r);
    expect(low.completionTime).toBeCloseTo(10, 6);
    expect(sum(low.stages.map(s => s.stageService))).toBeCloseTo(10, 6);
  });
});
