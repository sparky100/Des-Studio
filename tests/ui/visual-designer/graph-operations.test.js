import { describe, expect, it } from "vitest";
import { deriveGraphFromModel } from "../../../src/ui/visual-designer/graph.js";
import {
  addVisualNode,
  connectVisualNodes,
  updateGraphLayout,
  updateVisualNode,
  validateVisualGraph,
  validateVisualConnection,
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

  it("blocks invalid and cyclic visual connections", () => {
    const graph = deriveGraphFromModel(baseModel);

    expect(validateVisualConnection(graph, "source:arrival-0", "sink:complete").ok).toBe(false);
    expect(validateVisualConnection(graph, "sink:complete", "queue:main-q").ok).toBe(false);
    expect(validateVisualConnection(graph, "activity:start-service", "activity:start-service").ok).toBe(false);
    expect(validateVisualConnection(graph, "activity:start-service", "queue:main-q")).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining("cycle"),
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
});
