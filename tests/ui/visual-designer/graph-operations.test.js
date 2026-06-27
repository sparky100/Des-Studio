import { describe, expect, it } from "vitest";
import { deriveGraphFromModel } from "../../../src/ui/visual-designer/graph.js";
import { validateModel } from "../../../src/engine/validation.js";
import {
  addVisualNode,
  addVisualPattern,
  createStarterFlowModel,
  connectVisualNodes,
  deleteVisualEdge,
  deleteVisualNodes,
  updateGraphLayout,
  updateVisualNode,
  validateVisualGraph,
  validateVisualConnection,
  VISUAL_PATTERNS,
} from "../../../src/ui/visual-designer/graph-operations.js";

const baseModel = {
  entityTypes: [
    { id: "customer", name: "Customer", role: "customer", attrDefs: [] },
    { id: "clerk", name: "Clerk", role: "server", count: 1, attrDefs: [] },
  ],
  queues: [
    { id: "main-q", name: "Main Queue", customerType: "Customer", discipline: "FIFO" },
    { id: "overflow-q", name: "Overflow Queue", customerType: "Customer", discipline: "FIFO" },
  ],
  stateVariables: [],
  bEvents: [
    { id: "arrival", name: "Customer Arrival", scheduledTime: "0", effect: "ARRIVE(Customer, Main Queue)", schedules: [] },
    { id: "complete", name: "Service Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [
    {
      id: "start-service",
      name: "Start Service",
      priority: 1,
      condition: "queue(Main Queue).length > 0 AND idle(Clerk).count > 0",
      effect: "ASSIGN(Main Queue, Clerk)",
      cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    },
  ],
};

describe("visual designer graph operations", () => {
  it("persists layout metadata without storing derived edges", () => {
    const graph = deriveGraphFromModel(baseModel);
    const next = updateGraphLayout(baseModel, graph, {
      nodes: [{ id: "queue:main-q", x: 321, y: 654 }],
      viewport: { x: -10, y: 20, zoom: 0.7 },
    });

    expect(next.graph.nodes.find(node => node.id === "queue:main-q")).toEqual(expect.objectContaining({ x: 321, y: 654 }));
    expect(next.graph.viewport).toEqual({ x: -10, y: 20, zoom: 0.7 });
    expect(next.graph.edges).toBeUndefined();
  });

  it("adds visual nodes as canonical model elements", () => {
    const withQueue = addVisualNode({ ...baseModel, queues: [], bEvents: [], cEvents: [] }, "queue");
    const withSource = addVisualNode(withQueue, "source");
    const withActivity = addVisualNode(withSource, "activity");
    const withSink = addVisualNode(withActivity, "sink");

    expect(withSink.queues.length).toBe(1);
    expect(withSink.bEvents.some(event => String(event.effect).startsWith("ARRIVE("))).toBe(true);
    expect(withSink.cEvents.some(event => String(event.effect).startsWith("ASSIGN("))).toBe(true);
    expect(withSink.bEvents.some(event => event.effect === "COMPLETE()")).toBe(true);
  });

  it("creates a linked starter flow for a blank model", () => {
    const starter = createStarterFlowModel({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] });
    const starterGraph = deriveGraphFromModel(starter);
    const edgePairs = starterGraph.edges.map(edge => `${edge.from}->${edge.to}`);
    const sinkNodes = starterGraph.nodes.filter(node => node.type === "sink");

    expect(starter.queues).toHaveLength(1);
    expect(starter.bEvents.some(event => String(event.effect).startsWith("ARRIVE("))).toBe(true);
    expect(starter.cEvents.some(event => String(event.effect).startsWith("ASSIGN("))).toBe(true);
    expect(starter.bEvents.some(event => event.effect === "COMPLETE()")).toBe(true);
    expect(sinkNodes).toHaveLength(1);
    expect(edgePairs.some(edge => edge.startsWith("source:") && edge.includes("->queue:queue-1"))).toBe(true);
    expect(edgePairs).toContain("queue:queue-1->activity:activity-1");
    expect(edgePairs.some(edge => edge.startsWith("activity:activity-1->sink:"))).toBe(true);
  });

  it("adds modelling patterns as runnable canonical model scaffolds", () => {
    expect(VISUAL_PATTERNS.map(pattern => pattern.id)).toEqual(expect.arrayContaining([
      "single-queue",
      "reneging",
      "finite-capacity",
      "priority-queue",
      "two-stage",
      "batching",
      "server-failure",
      "cost-tracking",
    ]));

    const priority = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, "priority-queue").model;
    expect(priority.queues).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Priority Queue", discipline: "PRIORITY" }),
    ]));
    expect(priority.entityTypes.find(type => type.role === "customer").attrDefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "priority", valueType: "number" }),
    ]));
    expect(priority.bEvents.some(event => String(event.effect).startsWith("ARRIVE("))).toBe(true);
    expect(priority.cEvents.some(event => String(event.effect).startsWith("ASSIGN("))).toBe(true);

    const reneging = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, "reneging").model;
    expect(reneging.bEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: "RENEGE(ctx)" }),
      expect.objectContaining({
        schedules: expect.arrayContaining([
          expect.objectContaining({ isRenege: true }),
        ]),
      }),
    ]));

    const finite = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, "finite-capacity").model;
    expect(finite.queues).toEqual(expect.arrayContaining([
      expect.objectContaining({ capacity: "20" }),
    ]));

    const batching = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, "batching").model;
    expect(batching.cEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: "BATCH(Batch Queue, 5)" }),
    ]));

    const failure = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, "server-failure").model;
    expect(failure.entityTypes.find(type => type.role === "server")).toEqual(expect.objectContaining({
      mtbfDist: "Exponential",
      mtbfDistParams: { mean: "120" },
      mttrDist: "Exponential",
      mttrDistParams: { mean: "20" },
    }));

    const cost = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, "cost-tracking").model;
    expect(cost.bEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: ["COMPLETE()", "COST(5)"] }),
    ]));
  });

  it("creates schema-compliant runnable models for every visual pattern scaffold", () => {
    for (const pattern of VISUAL_PATTERNS) {
      const result = addVisualPattern({ entityTypes: [], queues: [], bEvents: [], cEvents: [], stateVariables: [] }, pattern.id);
      const validation = validateModel({
        ...result.model,
        maxSimTime: 500,
        replications: 1,
        terminationMode: "time",
      });

      expect(validation.errors, pattern.id).toEqual([]);
    }
  });

  it("applies compatible patterns to a selected existing queue instead of adding a duplicate flow", () => {
    const graph = deriveGraphFromModel(baseModel);
    const mainQueueNode = graph.nodes.find(node => node.id === "queue:main-q");

    const finite = addVisualPattern(baseModel, "finite-capacity", { anchorNode: mainQueueNode });
    expect(finite.appliedToSelection).toBe(true);
    expect(finite.model.queues).toHaveLength(baseModel.queues.length);
    expect(finite.model.queues.find(queue => queue.id === "main-q")).toEqual(expect.objectContaining({
      capacity: "20",
    }));

    const priority = addVisualPattern(baseModel, "priority-queue", { anchorNode: mainQueueNode });
    expect(priority.appliedToSelection).toBe(true);
    expect(priority.model.queues.find(queue => queue.id === "main-q")).toEqual(expect.objectContaining({
      discipline: "PRIORITY",
    }));
    expect(priority.model.entityTypes.find(type => type.name === "Customer").attrDefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "priority", valueType: "number" }),
    ]));

    const reneging = addVisualPattern(baseModel, "reneging", { anchorNode: mainQueueNode });
    expect(reneging.appliedToSelection).toBe(true);
    expect(reneging.model.queues).toHaveLength(baseModel.queues.length);
    expect(reneging.model.bEvents.find(event => event.id === "arrival").schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ isRenege: true }),
    ]));
    expect(reneging.model.bEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: "RENEGE(ctx)" }),
    ]));
  });

  it("can place a newly added visual node at a requested canvas position", () => {
    const next = addVisualNode(baseModel, "queue", { x: 777, y: 333 });

    expect(next.graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "queue", x: 777, y: 333 }),
    ]));
    expect(next.graph.edges).toBeUndefined();
  });

  it("applies valid visual connections to canonical model logic", () => {
    const graph = deriveGraphFromModel(baseModel);
    const sourceId = "source:arrival-0";
    const queueId = "queue:overflow-q";
    const activityId = "activity:start-service";
    const sinkId = "sink:complete";

    const arrivalResult = connectVisualNodes(baseModel, graph, sourceId, queueId);
    expect(arrivalResult.validation.ok).toBe(true);
    expect(arrivalResult.model.bEvents.find(event => event.id === "arrival").effect).toBe("ARRIVE(Customer, Overflow Queue)");

    const startResult = connectVisualNodes(baseModel, graph, queueId, activityId);
    expect(startResult.validation.ok).toBe(true);
    expect(startResult.model.cEvents.find(event => event.id === "start-service")).toEqual(expect.objectContaining({
      condition: "queue(Overflow Queue).length > 0 AND idle(Clerk).count > 0",
      effect: "ASSIGN(Overflow Queue, Clerk)",
    }));

    const sinkResult = connectVisualNodes(baseModel, graph, activityId, sinkId);
    expect(sinkResult.validation.ok).toBe(true);
    expect(sinkResult.model.cEvents.find(event => event.id === "start-service").cSchedules[0].eventId).toBe("complete");
  });

  it("blocks invalid connections and allows cyclic back-edges as loop edges", () => {
    const graph = deriveGraphFromModel(baseModel);

    expect(validateVisualConnection(graph, "source:arrival-0", "sink:complete").ok).toBe(false);
    expect(validateVisualConnection(graph, "sink:complete", "queue:main-q").ok).toBe(false);
    expect(validateVisualConnection(graph, "activity:start-service", "activity:start-service").ok).toBe(false);
    // Activity → Queue back-edges are now allowed as loop edges (F12.4)
    expect(validateVisualConnection(graph, "activity:start-service", "queue:main-q")).toEqual(expect.objectContaining({
      ok: true,
      loop: true,
    }));
  });

  it("updates selected node fields and re-derives graph edges", () => {
    const graph = deriveGraphFromModel(baseModel);
    const queue = graph.nodes.find(node => node.id === "queue:main-q");
    const next = updateVisualNode(baseModel, queue, { name: "Front Desk Queue" });

    expect(next.queues.find(item => item.id === "main-q").name).toBe("Front Desk Queue");
    expect(next.bEvents.find(event => event.id === "arrival").effect).toBe("ARRIVE(Customer, Front Desk Queue)");
    expect(next.cEvents.find(event => event.id === "start-service").condition).toContain("queue(Front Desk Queue).length");
    expect(deriveGraphFromModel(next).edges.map(edge => `${edge.from}->${edge.to}`)).toContain("source:arrival-0->queue:main-q");
  });

  it("updates source inter-arrival and activity service distributions through selected node patches", () => {
    const graph = deriveGraphFromModel(baseModel);
    const source = graph.nodes.find(node => node.id === "source:arrival-0");
    const activity = graph.nodes.find(node => node.id === "activity:start-service");
    const withArrivalDist = updateVisualNode(baseModel, source, {
      interarrival: { dist: "Exponential", distParams: { mean: "5" } },
    });
    const withServiceDist = updateVisualNode(withArrivalDist, activity, {
      serviceTime: { dist: "Fixed", distParams: { value: "7" } },
    });

    expect(withServiceDist.bEvents.find(event => event.id === "arrival").schedules[0]).toEqual(expect.objectContaining({
      eventId: "arrival",
      dist: "Exponential",
      distParams: { mean: "5" },
    }));
    expect(withServiceDist.cEvents.find(event => event.id === "start-service").cSchedules[0]).toEqual(expect.objectContaining({
      dist: "Fixed",
      distParams: { value: "7" },
    }));
  });

  it("updates server type in condition idle() clause and ASSIGN effect without touching queue name", () => {
    const graph = deriveGraphFromModel(baseModel);
    const activity = graph.nodes.find(node => node.id === "activity:start-service");
    const modelWithTwoServers = {
      ...baseModel,
      entityTypes: [
        ...baseModel.entityTypes,
        { id: "manager", name: "Manager", role: "server", count: 1, attrDefs: [] },
      ],
    };

    const next = updateVisualNode(modelWithTwoServers, activity, { serverType: "Manager" });
    const updated = next.cEvents.find(event => event.id === "start-service");

    expect(updated.effect).toBe("ASSIGN(Main Queue, Manager)");
    expect(updated.condition).toContain("idle(Manager).count > 0");
    expect(updated.condition).not.toContain("idle(Clerk)");
    expect(updated.condition).toContain("queue(Main Queue).length > 0");
  });

  it("deleteVisualEdge removes the queue target from an arrival (Source→Queue) edge", () => {
    const graph = deriveGraphFromModel(baseModel);
    const arrivalEdge = graph.edges.find(e => e.source === "arrival");
    expect(arrivalEdge).toBeDefined();

    const next = deleteVisualEdge(baseModel, graph, arrivalEdge.id);

    const arrivalEvent = next.bEvents.find(be => be.id === "arrival");
    // Queue target removed: ARRIVE(Customer, Main Queue) → ARRIVE(Customer)
    expect(arrivalEvent.effect).toBe("ARRIVE(Customer)");
    // The graph no longer derives the arrival edge
    const nextGraph = deriveGraphFromModel(next);
    expect(nextGraph.edges.some(e => e.source === "arrival")).toBe(false);
  });

  it("deleteVisualEdge removes the cSchedule entry from a terminal (Activity→Sink) edge", () => {
    const graph = deriveGraphFromModel(baseModel);
    const terminalEdge = graph.edges.find(e => e.source === "terminal");
    expect(terminalEdge).toBeDefined();

    const next = deleteVisualEdge(baseModel, graph, terminalEdge.id);

    const startService = next.cEvents.find(ce => ce.id === "start-service");
    // cSchedule referencing the "complete" sink bEvent must be removed
    expect((startService.cSchedules || []).some(s => s.eventId === "complete")).toBe(false);
    // The "complete" bEvent itself must still exist (it is a Sink node, not exclusively owned for deletion here)
    expect(next.bEvents.some(be => be.id === "complete")).toBe(true);
  });

  it("deletes multiple visual nodes from the canonical model", () => {
    const graph = deriveGraphFromModel(baseModel);
    const nodes = [
      graph.nodes.find(node => node.id === "queue:main-q"),
      graph.nodes.find(node => node.id === "queue:overflow-q"),
    ];

    const next = deleteVisualNodes(baseModel, nodes);

    expect(next.queues).toHaveLength(0);
    expect(next.bEvents.find(event => event.id === "arrival").effect).toBe("ARRIVE(Customer)");
    expect(next.cEvents.find(event => event.id === "start-service")).toBeUndefined();
    expect(deriveGraphFromModel(next).nodes.some(node => node.id.startsWith("queue:"))).toBe(false);
  });

  it("summarizes visual graph warnings for incomplete routes", () => {
    const graph = deriveGraphFromModel({
      ...baseModel,
      bEvents: [],
      cEvents: [],
    });

    expect(validateVisualGraph(graph)).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("No Source node") }),
      expect.objectContaining({ message: expect.stringContaining("No Sink node") }),
      expect.objectContaining({ nodeId: "queue:main-q", message: expect.stringContaining("no downstream activity") }),
    ]));
  });

  it("addVisualNode adds a container with an id that avoids existing container ids", () => {
    const modelWithContainer = { ...baseModel, containerTypes: [{ id: "container-1", capacity: "100", initialLevel: "0" }] };
    const next = addVisualNode(modelWithContainer, "container");

    expect(next.containerTypes).toHaveLength(2);
    const added = next.containerTypes.find(ct => ct.id !== "container-1");
    expect(added).toEqual(expect.objectContaining({ id: "container-2", capacity: null, initialLevel: 0 }));
    expect(deriveGraphFromModel(next).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "container:container-2", type: "container", refId: "container-2" }),
    ]));
  });

  it("validateVisualConnection rejects any connection touching a container node", () => {
    const modelWithContainer = { ...baseModel, containerTypes: [{ id: "Tank", capacity: "100", initialLevel: "0" }] };
    const graph = deriveGraphFromModel(modelWithContainer);

    expect(validateVisualConnection(graph, "container:Tank", "queue:main-q")).toEqual(expect.objectContaining({ ok: false }));
    expect(validateVisualConnection(graph, "queue:main-q", "container:Tank")).toEqual(expect.objectContaining({ ok: false }));
    expect(validateVisualConnection(graph, "container:Tank", "container:Tank")).toEqual(expect.objectContaining({ ok: false }));
  });

  it("updateVisualNode renames a container id and propagates the rename into FILL/DRAIN/container() references", () => {
    const modelWithContainer = {
      ...baseModel,
      containerTypes: [{ id: "Tank", capacity: "1000", initialLevel: "500" }],
      queues: [
        ...baseModel.queues,
        { id: "balk-q", name: "Balk Queue", discipline: "FIFO", balkCondition: { variable: "container(Tank).level", operator: ">=", value: 900 } },
      ],
      bEvents: [
        ...baseModel.bEvents,
        { id: "fill", name: "Fill", scheduledTime: "2", effect: "FILL(Tank, 100)", schedules: [] },
        {
          id: "route-be", name: "Route", scheduledTime: "3", effect: "RELEASE(Nurse)",
          routing: [{ condition: { variable: "container(Tank).level", operator: ">=", value: 10 }, queueName: "main-q" }],
          schedules: [],
        },
      ],
      cEvents: [
        ...baseModel.cEvents,
        { id: "drain", name: "Drain", priority: 2, condition: "container(Tank).level >= 10", effect: "DRAIN(Tank, 10)", cSchedules: [] },
        {
          id: "sched-ce", name: "Scheduled", priority: 3, condition: "queue(main-q).length > 0", effect: "ASSIGN(main-q, Nurse)",
          cSchedules: [{ eventId: "drain", dist: "Fixed", distParams: { value: "1" }, when: { variable: "container(Tank).level", operator: "<", value: 5 } }],
        },
      ],
    };
    const graph = deriveGraphFromModel(modelWithContainer);
    const containerNode = graph.nodes.find(node => node.id === "container:Tank");
    expect(containerNode).toBeDefined();

    const next = updateVisualNode(modelWithContainer, containerNode, { id: "Reservoir" });

    expect(next.containerTypes.find(ct => ct.id === "Reservoir")).toBeDefined();
    expect(next.containerTypes.find(ct => ct.id === "Tank")).toBeUndefined();
    expect(next.bEvents.find(event => event.id === "fill").effect).toBe("FILL(Reservoir, 100)");
    expect(next.cEvents.find(event => event.id === "drain")).toEqual(expect.objectContaining({
      condition: "container(Reservoir).level >= 10",
      effect: "DRAIN(Reservoir, 10)",
    }));
    expect(next.bEvents.find(event => event.id === "route-be").routing[0].condition.variable).toBe("container(Reservoir).level");
    expect(next.cEvents.find(event => event.id === "sched-ce").cSchedules[0].when.variable).toBe("container(Reservoir).level");
    expect(next.queues.find(q => q.id === "balk-q").balkCondition.variable).toBe("container(Reservoir).level");
  });

  it("updateVisualNode updates container capacity and initialLevel without renaming", () => {
    const modelWithContainer = { ...baseModel, containerTypes: [{ id: "Tank", capacity: "1000", initialLevel: "500" }] };
    const graph = deriveGraphFromModel(modelWithContainer);
    const containerNode = graph.nodes.find(node => node.id === "container:Tank");

    const next = updateVisualNode(modelWithContainer, containerNode, { capacity: "2000", initialLevel: "750" });

    expect(next.containerTypes.find(ct => ct.id === "Tank")).toEqual(expect.objectContaining({
      id: "Tank", capacity: "2000", initialLevel: "750",
    }));
  });
});
