import { describe, expect, it } from "vitest";
import { computeSectionLiveStats } from "../../../src/ui/execute/sectionLiveStats.js";

const nodes = [
  { id: "queue:q1", type: "queue", label: "Waiting", sectionId: "a" },
  { id: "activity:c1", type: "activity", label: "Serve", sectionId: "a" },
  { id: "queue:q2", type: "queue", label: "Review", sectionId: "b" },
  { id: "sink:x", type: "sink", label: "Done" },
];

const customer = (id, extra) => ({ id, role: "customer", type: "Customer", ...extra });

describe("computeSectionLiveStats", () => {
  it("returns nothing before a run starts", () => {
    expect(computeSectionLiveStats({ nodes, snap: null }).size).toBe(0);
  });

  it("counts who is in each section, who has been through it and how long they stayed", () => {
    const snap = {
      entities: [
        { id: 1, role: "server", type: "Clerk", status: "busy" },
        customer(2, { status: "waiting", queue: "Waiting" }),
        customer(3, { status: "serving", ceventName: "Serve" }),
        customer(4, { status: "waiting", queue: "Review", stages: [{ queueName: "Waiting", stageWait: 2, stageService: 3 }] }),
        customer(5, { status: "done", stages: [{ queueName: "Waiting", stageWait: 1, stageService: 1 }, { queueName: "Review", stageWait: 4, stageService: 0 }] }),
      ],
    };
    const activityLive = new Map([["activity:c1", { utilisation: 83.4, serverTypeName: "Clerk" }]]);
    const stats = computeSectionLiveStats({ nodes, snap, activityLive });
    // a: customers 2 (waiting) and 3 (serving) are here; 4 and 5 finished a stay there
    expect(stats.get("a")).toMatchObject({ inNow: 2, entered: 4, left: 2, avgTime: 3.5 });
    expect(stats.get("a").busiest).toEqual({ name: "Clerk", utilisation: 83.4 });
    // b: customer 4 is waiting in Review; 5 has finished a stay there
    expect(stats.get("b")).toMatchObject({ inNow: 1, entered: 2, left: 1, avgTime: 4 });
    expect(stats.get("b").busiest).toBeNull();
  });

  it("reports no average time until someone has finished a stay", () => {
    const stats = computeSectionLiveStats({ nodes, snap: { entities: [customer(2, { status: "waiting", queue: "Waiting" })] } });
    expect(stats.get("a")).toMatchObject({ inNow: 1, entered: 1, left: 0, avgTime: null });
  });
});
