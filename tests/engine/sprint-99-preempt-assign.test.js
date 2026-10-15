// Sprint 99 Phase 2 — ASSIGN(Queue, ServerType, PREEMPT[, Criterion][, Policy][, MAX:n][, MINSERVICE:t]).
// See docs/reviews/sprint-99-preemption-plan.md and src/engine/preemptAssign.js.
import { describe, expect, it } from "vitest";
import { buildEngine } from "../../src/engine/index.js";
import { parsePreemptOptions, preemptRankAttrs } from "../../src/engine/preemptAssign.js";
import { validateModel } from "../../src/engine/validation.js";

/**
 * Jobs arrive as [time, prio, work, tag]; each needs `work` units of Server.
 * One C-event serves queue Q with `effect`; no counters or gating events.
 */
function model({ effect = "ASSIGN(Q, Server, PREEMPT)", discipline = "PRIORITY(prio)", arrivals = [[0, 2, 10, "low"], [5, 1, 2, "high"]], servers = 1, extraEntityTypes = [], extraQueues = [], extraBEvents = [], extraCEvents = [] } = {}) {
  return {
    entityTypes: [
      { id: "j", name: "Job", role: "customer", count: 0, attrDefs: [
        { name: "prio", valueType: "number", defaultValue: 9, mutable: true },
        { name: "work", valueType: "number", defaultValue: 1, mutable: true },
        { name: "tag", valueType: "string", defaultValue: "", mutable: true },
      ] },
      { id: "s", name: "Server", role: "server", count: servers, attrDefs: [] },
      ...extraEntityTypes,
    ],
    stateVariables: [],
    queues: [{ id: "q", name: "Q", customerType: "Job", discipline }, ...extraQueues],
    bEvents: [
      ...arrivals.map(([t, prio, work, tag], i) => ({
        id: `a${i}`, name: `Arrive ${tag}`, scheduledTime: String(t),
        effect: ["ARRIVE(Job, Q)", `SET_ATTR(prio, ${prio})`, `SET_ATTR(work, ${work})`, `SET_ATTR(tag, "${tag}")`], schedules: [],
      })),
      { id: "done", name: "Done", scheduledTime: "1e12", effect: ["COMPLETE()"], schedules: [] },
      ...extraBEvents,
    ],
    cEvents: [
      { id: "serve", name: "Serve", priority: 1,
        condition: { variable: "queue(Q).length", operator: ">", value: 0 },
        effect: [effect],
        cSchedules: [{ eventId: "done", dist: "EntityAttr", distParams: { attr: "work" }, useEntityCtx: true }] },
      ...extraCEvents,
    ],
  };
}

const run = (m, maxTime = 60) => buildEngine(m, 1, 0, maxTime).runAll();
const job = (r, tag) => r.entitySummary.find(e => e.role === "customer" && e.attrs?.tag === tag);
const done = (r, tag) => job(r, tag)?.completionTime;
const logText = r => r.log.map(l => l.message || "").join("\n");

describe("ASSIGN … PREEMPT — basics", () => {
  it("takes the server from a lower-ranked job and resumes it with its remaining time", () => {
    const r = run(model());
    expect(done(r, "high")).toBeCloseTo(7, 6);
    expect(done(r, "low")).toBeCloseTo(12, 6);
    const low = job(r, "low");
    expect(low.stages[0].stageService).toBeCloseTo(10, 6);
    expect(low.stages[0].stageWait).toBeCloseTo(2, 6);
    expect(low.stages[0].interruptions).toBe(1);
    expect(logText(r)).toMatch(/took server #\d+ \(Server\) from #\d+ \(prio=2\) \[remaining 5\.000 t\]/);
  });

  it("with an idle server it is an ordinary ASSIGN", () => {
    const r = run(model({ servers: 2 }));
    expect(done(r, "low")).toBeCloseTo(10, 6);
    expect(done(r, "high")).toBeCloseTo(7, 6);
    expect(job(r, "low").stages[0].interruptions).toBeUndefined();
  });

  it("never interrupts an equal-ranked job", () => {
    const r = run(model({ arrivals: [[0, 2, 10, "first"], [5, 2, 2, "second"]] }));
    expect(done(r, "first")).toBeCloseTo(10, 6);
    expect(done(r, "second")).toBeCloseTo(12, 6);
  });

  it("never interrupts a higher-ranked job", () => {
    const r = run(model({ arrivals: [[0, 1, 10, "high"], [5, 2, 2, "low"]] }));
    expect(done(r, "high")).toBeCloseTo(10, 6);
    expect(done(r, "low")).toBeCloseTo(12, 6);
  });

  it("a queue that doesn't rank jobs never preempts, and says why", () => {
    const r = run(model({ discipline: "FIFO" }));
    expect(done(r, "low")).toBeCloseTo(10, 6);
    expect(done(r, "high")).toBeCloseTo(12, 6);
    expect(logText(r)).toMatch(/doesn't rank jobs/);
  });

  it("PRIORITY(attr) ranks jobs on a FIFO queue", () => {
    const r = run(model({ discipline: "FIFO", effect: "ASSIGN(Q, Server, PREEMPT, PRIORITY(prio))" }));
    expect(done(r, "high")).toBeCloseTo(7, 6);
    expect(done(r, "low")).toBeCloseTo(12, 6);
  });

  it("interrupts the lowest-ranked of several jobs in service", () => {
    const r = run(model({ servers: 2, arrivals: [[0, 3, 10, "lowest"], [0, 2, 10, "mid"], [5, 1, 2, "high"]] }));
    expect(done(r, "high")).toBeCloseTo(7, 6);
    expect(done(r, "mid")).toBeCloseTo(10, 6);
    expect(done(r, "lowest")).toBeCloseTo(12, 6);
  });

  it("LONGEST / SHORTEST pick by service so far among lower-ranked jobs", () => {
    const arrivals = [[0, 3, 10, "early"], [1, 3, 10, "late"], [5, 1, 2, "high"]];
    const longest = run(model({ servers: 2, arrivals, effect: "ASSIGN(Q, Server, PREEMPT, LONGEST)" }));
    expect(done(longest, "early")).toBeCloseTo(12, 6);
    expect(done(longest, "late")).toBeCloseTo(11, 6);
    const shortest = run(model({ servers: 2, arrivals, effect: "ASSIGN(Q, Server, PREEMPT, SHORTEST)" }));
    expect(done(shortest, "early")).toBeCloseTo(10, 6);
    expect(done(shortest, "late")).toBeCloseTo(13, 6);
  });
});

describe("ASSIGN … PREEMPT — what the displaced job gets", () => {
  it("RESTART: its full duration again", () => {
    const r = run(model({ effect: "ASSIGN(Q, Server, PREEMPT, RESTART)" }));
    expect(done(r, "low")).toBeCloseTo(17, 6);
  });

  it("RESAMPLE: a fresh duration", () => {
    const r = run(model({ effect: "ASSIGN(Q, Server, PREEMPT, RESAMPLE)" }));
    expect(done(r, "low")).toBeCloseTo(17, 6); // EntityAttr work = 10 again
  });

  it("DROP:<Queue>: it joins that queue and starts that activity afresh", () => {
    const r = run(model({
      effect: "ASSIGN(Q, Server, PREEMPT, DROP:Rework)",
      extraEntityTypes: [{ id: "f", name: "Fixer", role: "server", count: 1, attrDefs: [] }],
      extraQueues: [{ id: "rw", name: "Rework", customerType: "Job", discipline: "FIFO" }],
      extraBEvents: [{ id: "fixed", name: "Fixed", scheduledTime: "1e12", effect: ["COMPLETE()"], schedules: [] }],
      extraCEvents: [{ id: "fix", name: "Fix", priority: 2,
        condition: { variable: "queue(Rework).length", operator: ">", value: 0 },
        effect: ["ASSIGN(Rework, Fixer)"],
        cSchedules: [{ eventId: "fixed", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }] }],
    }));
    expect(done(r, "high")).toBeCloseTo(7, 6);
    expect(done(r, "low")).toBeCloseTo(8, 6); // Rework 5→8, not its 5 remaining
  });
});

describe("ASSIGN … PREEMPT — anti-thrash limits", () => {
  const arrivals = [[0, 2, 10, "low"], [2, 1, 2, "h1"], [6, 1, 2, "h2"]];

  it("without limits a job can be interrupted again", () => {
    const r = run(model({ arrivals }));
    expect(done(r, "h2")).toBeCloseTo(8, 6);
    expect(done(r, "low")).toBeCloseTo(14, 6);
  });

  it("MAX:1 protects a job after its first interruption", () => {
    const r = run(model({ arrivals, effect: "ASSIGN(Q, Server, PREEMPT, MAX:1)" }));
    expect(done(r, "h1")).toBeCloseTo(4, 6);
    expect(done(r, "low")).toBeCloseTo(12, 6);
    expect(done(r, "h2")).toBeCloseTo(14, 6);
  });

  it("MINSERVICE:t leaves a job that has just started alone (checked at the next event)", () => {
    const quiet = run(model({ effect: "ASSIGN(Q, Server, PREEMPT, MINSERVICE:3)", arrivals: [[0, 2, 10, "low"], [2, 1, 2, "high"]] }));
    expect(done(quiet, "low")).toBeCloseTo(10, 6);
    expect(done(quiet, "high")).toBeCloseTo(12, 6);
    const tick = run(model({
      effect: "ASSIGN(Q, Server, PREEMPT, MINSERVICE:3)", arrivals: [[0, 2, 10, "low"], [2, 1, 2, "high"]],
      extraBEvents: [{ id: "tick", name: "Tick", scheduledTime: "4", effect: [], schedules: [] }],
    }));
    expect(done(tick, "high")).toBeCloseTo(6, 6);
    expect(done(tick, "low")).toBeCloseTo(12, 6);
  });
});

describe("ASSIGN … PREEMPT — options and validation", () => {
  it("parses criterion, policy and limits", () => {
    expect(parsePreemptOptions("PRIORITY(sev), DROP:Rework, MAX:2, MINSERVICE:0.5")).toEqual({
      criterion: { kind: "priority", attr: "sev" }, policy: "DROP", dropQueue: "Rework", maxPreemptions: 2, minService: 0.5, errors: [],
    });
    expect(parsePreemptOptions(undefined).policy).toBe("RESUME");
    expect(parsePreemptOptions("RESTART, RESAMPLE").errors).toHaveLength(1);
    expect(parsePreemptOptions("MAX:0").errors).toHaveLength(1);
    expect(parsePreemptOptions("SOON").errors[0]).toMatch(/unknown option "SOON"/);
  });

  it("ranks by the queue discipline's key", () => {
    expect(preemptRankAttrs("PRIORITY(sev)", null)).toEqual(["sev"]);
    expect(preemptRankAttrs("PRIORITY", null)).toEqual(["priority"]);
    expect(preemptRankAttrs("EDD", null)).toEqual(["dueDate"]);
    expect(preemptRankAttrs("FIFO", null)).toBeNull();
    expect(preemptRankAttrs("FIFO", { kind: "priority", attr: "x" })).toEqual(["x"]);
  });

  it("an invalid option is reported at run time and does nothing", () => {
    const r = run(model({ effect: "ASSIGN(Q, Server, PREEMPT, SOON)" }));
    expect(logText(r)).toMatch(/unknown option "SOON"/);
    expect(job(r, "low").status).not.toBe("done");
  });

  const codes = (m) => { const v = validateModel(m); return [...(v.errors || []), ...(v.warnings || [])]; };
  const issue = (m, code) => codes(m).find(i => i.code === code);

  it("V81: flags bad options, a queue that doesn't rank jobs, a missing attribute and an unknown DROP queue", () => {
    expect(issue(model(), "V81")).toBeUndefined();
    expect(issue(model({ effect: "ASSIGN(Q, Server, PREEMPT, SOON)" }), "V81")?.message).toMatch(/unknown option/);
    expect(issue(model({ discipline: "FIFO" }), "V81")?.message).toMatch(/doesn't rank jobs/);
    expect(issue(model({ effect: "ASSIGN(Q, Server, PREEMPT, PRIORITY(severity))" }), "V81")?.message).toMatch(/severity/);
    expect(issue(model({ effect: "ASSIGN(Q, Server, PREEMPT, DROP:Nowhere)" }), "V81")?.message).toMatch(/Nowhere/);
  });
});

describe("ASSIGN … PREEMPT — renames and plain PREEMPT", () => {
  it("renaming a queue updates DROP:<Queue> and the queue argument", async () => {
    const { renameQueue } = await import("../../src/engine/queue-refs.js");
    const m = model({ effect: "ASSIGN(Q, Server, PREEMPT, DROP:Rework, MAX:2)" });
    m.queues.push({ id: "rw", name: "Rework", customerType: "Job", discipline: "FIFO" });
    const renamed = renameQueue(m, "Rework", "Redo");
    expect(renamed.cEvents[0].effect).toEqual(["ASSIGN(Q, Server, PREEMPT, DROP:Redo, MAX:2)"]);
  });

  it("V81 warns when a C-event fires PREEMPT without checking for an idle server", () => {
    const m = model();
    m.cEvents.push({ id: "p", name: "Bump", priority: 0, condition: { variable: "queue(Q).length", operator: ">", value: 0 }, effect: ["PREEMPT(Server)"], cSchedules: [] });
    const v = validateModel(m);
    expect(v.warnings.some(w => w.code === "V81" && /without checking idle\(Server\)/.test(w.message))).toBe(true);
    m.cEvents[1].condition = { operator: "AND", clauses: [m.cEvents[1].condition, { variable: "idle(Server).count", operator: "==", value: 0 }] };
    expect(validateModel(m).warnings.some(w => w.code === "V81")).toBe(false);
  });
});
