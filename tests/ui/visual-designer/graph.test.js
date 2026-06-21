import { describe, expect, it } from "vitest";
import { deriveGraphFromModel, graphLayoutFromDerivedGraph } from "../../../src/ui/visual-designer/graph.js";
import { twoStageClinicModel as twoStageModel } from "../../__helpers__/twoStageModel.js";

function assertNodesHaveFiniteCoords(graph) {
  graph.nodes.forEach(node => {
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.y)).toBe(true);
  });
}

const minimalModel = {
  entityTypes: [
    { id: "customer", name: "Customer", role: "customer", attrDefs: [] },
    { id: "server", name: "Server", role: "server", count: 1, attrDefs: [] },
  ],
  queues: [
    { id: "waiting", name: "Waiting", customerType: "Customer", discipline: "FIFO" },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: "arrive",
      name: "Customer Arrival",
      scheduledTime: "0",
      effect: "ARRIVE(Customer, Waiting)",
      schedules: [],
    },
    {
      id: "complete",
      name: "Service Complete",
      scheduledTime: "9999",
      effect: "COMPLETE()",
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: "start-service",
      name: "Start Service",
      priority: 1,
      condition: "queue(Waiting).length > 0 AND idle(Server).count > 0",
      effect: "ASSIGN(Waiting, Server)",
      cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    },
  ],
};

describe("deriveGraphFromModel", () => {
  it("derives source, queue, activity, and sink nodes from the canonical model", () => {
    const graph = deriveGraphFromModel(twoStageModel);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "source:arrive-0", type: "source", refId: "arrive" }),
      expect.objectContaining({ id: "queue:triage-q", type: "queue", refId: "triage-q" }),
      expect.objectContaining({ id: "queue:consult-q", type: "queue", refId: "consult-q" }),
      expect.objectContaining({ id: "activity:start-triage", type: "activity", refId: "start-triage" }),
      expect.objectContaining({ id: "activity:start-consult", type: "activity", refId: "start-consult" }),
      expect.objectContaining({ id: "sink:consult-complete", type: "sink", refId: "consult-complete" }),
    ]));
  });

  it("shows the claimed server type on an activity node's sublabel", () => {
    const graph = deriveGraphFromModel(minimalModel);
    const activity = graph.nodes.find(node => node.id === "activity:start-service");
    expect(activity.sublabel).toBe("Server · Priority 1");
  });

  it("falls back to priority-only sublabel for a DELAY activity (no server claimed)", () => {
    const model = {
      ...minimalModel,
      cEvents: [
        { ...minimalModel.cEvents[0], effect: "DELAY(Waiting)" },
      ],
    };
    const graph = deriveGraphFromModel(model);
    const activity = graph.nodes.find(node => node.id === "activity:start-service");
    expect(activity.sublabel).toBe("Delay · Priority 1");
  });

  it("derives visual edges from ARRIVE, ASSIGN, RELEASE, and COMPLETE logic", () => {
    const graph = deriveGraphFromModel(twoStageModel);
    const edgePairs = graph.edges.map(edge => `${edge.from}->${edge.to}`);

    expect(edgePairs).toContain("source:arrive-0->queue:triage-q");
    expect(edgePairs).toContain("queue:triage-q->activity:start-triage");
    expect(edgePairs).toContain("activity:start-triage->queue:consult-q");
    expect(edgePairs).toContain("queue:consult-q->activity:start-consult");
    expect(edgePairs).toContain("activity:start-consult->sink:consult-complete");
  });

  it("binds direct-exit routing sinks to the matching route count key", () => {
    const graph = deriveGraphFromModel({
      ...twoStageModel,
      bEvents: twoStageModel.bEvents.map(event =>
        event.id === "triage-complete"
          ? {
              ...event,
              effect: "RELEASE(Triage Nurse)",
              probabilisticRouting: [
                { probability: 0.25, queueName: null },
                { probability: 0.75, queueName: "Consultant Queue" },
              ],
            }
          : event
      ),
    });

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "sink:exit-triage-complete",
        type: "sink",
        refId: "route-exit:triage-complete",
      }),
    ]));
    expect(graph.edges.map(edge => `${edge.from}->${edge.to}`))
      .toContain("activity:start-triage->sink:exit-triage-complete");
  });

  it("resolves section membership for a direct-exit sink via its underlying bEvent id, not its route-exit: prefixed refId", () => {
    const graph = deriveGraphFromModel({
      ...twoStageModel,
      sections: [
        { id: "sec-1", name: "Triage", color: "#ff0000", memberIds: ["triage-complete"] },
      ],
      bEvents: twoStageModel.bEvents.map(event =>
        event.id === "triage-complete"
          ? {
              ...event,
              effect: "RELEASE(Triage Nurse)",
              probabilisticRouting: [
                { probability: 0.25, queueName: null },
                { probability: 0.75, queueName: "Consultant Queue" },
              ],
            }
          : event
      ),
    });

    const exitSink = graph.nodes.find(n => n.id === "sink:exit-triage-complete");
    expect(exitSink.sectionId).toBe("sec-1");
    expect(exitSink.sectionColor).toBe("#ff0000");
  });

  it("preserves persisted layout metadata while deriving topology from the model", () => {
    const graph = deriveGraphFromModel({
      ...twoStageModel,
      graph: {
        version: 1,
        nodes: [
          { id: "queue:triage-q", type: "queue", refId: "triage-q", x: 111, y: 222 },
        ],
        viewport: { x: -20, y: 10, zoom: 0.8 },
      },
    });

    expect(graph.nodes.find(node => node.id === "queue:triage-q")).toEqual(expect.objectContaining({ x: 111, y: 222 }));
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.viewport).toEqual({ x: -20, y: 10, zoom: 0.8 });
  });

  it("serializes layout metadata without storing derived edges", () => {
    const graph = deriveGraphFromModel(twoStageModel);
    const layout = graphLayoutFromDerivedGraph(graph);

    expect(layout.nodes[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      type: expect.any(String),
      x: expect.any(Number),
      y: expect.any(Number),
    }));
    expect(layout.edges).toBeUndefined();
  });

  it("keeps the default source-to-sink path compact enough for unzoomed review", () => {
    const graph = deriveGraphFromModel(minimalModel);
    const xValues = graph.nodes.map(node => node.x);

    // Dagre uses a left margin (DAGRE_MARGIN_X=40) so the origin is still ~40,
    // and four nodes in a linear chain should fit within a standard viewport width.
    expect(Math.min(...xValues)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xValues) - Math.min(...xValues)).toBeLessThanOrEqual(900);
    expect(graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  // F10.7 — multiple labelled outgoing edges from routing table
  it("derives multiple labelled edges from a routing table on a RELEASE B-event", () => {
    const model = {
      ...twoStageModel,
      queues: [
        ...twoStageModel.queues,
        { id: "icu-q", name: "ICU Queue", customerType: "Patient", discipline: "FIFO" },
      ],
      bEvents: [
        ...twoStageModel.bEvents.filter(b => b.id !== "triage-complete"),
        {
          id: "triage-complete",
          name: "Triage Complete",
          scheduledTime: "9999",
          effect: "RELEASE(Triage Nurse)",
          routing: [
            { condition: { variable: "Entity.outcome", operator: "==", value: "ICU" }, queueName: "ICU Queue" },
          ],
          defaultQueueName: "Consultant Queue",
          schedules: [],
        },
      ],
    };

    const graph = deriveGraphFromModel(model);
    const activityEdges = graph.edges.filter(e => e.from === "activity:start-triage");

    // Should have at least a condition edge and a fallback edge
    expect(activityEdges.length).toBeGreaterThanOrEqual(2);
    const labels = activityEdges.map(e => e.label).filter(Boolean);
    expect(labels).toContain("fallback");
    expect(labels.some(l => String(l).includes("ICU"))).toBe(true);
  });

  it("supports generated object effects when deriving arrivals", () => {
    const graph = deriveGraphFromModel({
      ...twoStageModel,
      bEvents: [
        {
          id: "arrive",
          name: "Patient Arrival",
          scheduledTime: "0",
          effect: [{ macro: "arrive", args: ["Patient", "Triage Queue"] }],
          schedules: [],
        },
      ],
      cEvents: [],
    });

    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "source:arrive-0", to: "queue:triage-q" }),
    ]));
  });
});

describe("dagre layout", () => {
  it("assigns finite x and y to every node", () => {
    assertNodesHaveFiniteCoords(deriveGraphFromModel(twoStageModel));
  });

  it("places source nodes to the left of sink nodes (left-to-right flow)", () => {
    const graph = deriveGraphFromModel(twoStageModel);
    const sourceX = graph.nodes.find(n => n.type === "source").x;
    const sinkX   = graph.nodes.find(n => n.type === "sink").x;
    expect(sourceX).toBeLessThan(sinkX);
  });

  it("gives parallel nodes at the same rank distinct y positions", () => {
    // Two separate arrival streams feeding two independent queues — both end up at depth 0.
    const parallelModel = {
      entityTypes: [
        { id: "p", name: "Patient", role: "customer", attrDefs: [] },
        { id: "s", name: "Server", role: "server", count: 1, attrDefs: [] },
      ],
      queues: [
        { id: "q1", name: "Queue A", customerType: "Patient", discipline: "FIFO" },
        { id: "q2", name: "Queue B", customerType: "Patient", discipline: "FIFO" },
      ],
      stateVariables: [],
      bEvents: [
        { id: "arrive1", name: "Arrival A", scheduledTime: "0", effect: "ARRIVE(Patient, Queue A)", schedules: [] },
        { id: "arrive2", name: "Arrival B", scheduledTime: "0", effect: "ARRIVE(Patient, Queue B)", schedules: [] },
        { id: "done",    name: "Done",      scheduledTime: "9999", effect: "COMPLETE()",             schedules: [] },
      ],
      cEvents: [
        {
          id: "svc1", name: "Serve A", priority: 1,
          condition: "queue(Queue A).length > 0",
          effect: "ASSIGN(Queue A, Server)",
          cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
        {
          id: "svc2", name: "Serve B", priority: 2,
          condition: "queue(Queue B).length > 0",
          effect: "ASSIGN(Queue B, Server)",
          cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    const graph = deriveGraphFromModel(parallelModel);
    const sourceNodes = graph.nodes.filter(n => n.type === "source");
    expect(sourceNodes.length).toBe(2);
    // Dagre must place them at different y positions, not stacked on top of each other.
    expect(sourceNodes[0].y).not.toBe(sourceNodes[1].y);
  });

  it("does not crash when the model contains a rework loop", () => {
    // Activity routes back to the same queue it consumed from — a cycle.
    const loopModel = {
      entityTypes: [
        { id: "p", name: "Patient", role: "customer", attrDefs: [] },
        { id: "s", name: "Server",  role: "server",   count: 1, attrDefs: [] },
      ],
      queues: [{ id: "q", name: "Rework Queue", customerType: "Patient", discipline: "FIFO" }],
      stateVariables: [],
      bEvents: [
        { id: "arrive",   name: "Arrive",   scheduledTime: "0",    effect: "ARRIVE(Patient, Rework Queue)", schedules: [] },
        { id: "complete", name: "Complete", scheduledTime: "9999", effect: "RELEASE(Server, Rework Queue)", schedules: [] },
      ],
      cEvents: [
        {
          id: "serve", name: "Serve", priority: 1,
          condition: "queue(Rework Queue).length > 0",
          effect: "ASSIGN(Rework Queue, Server)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };

    // Must not throw; all nodes must receive valid positions.
    expect(() => deriveGraphFromModel(loopModel)).not.toThrow();
    assertNodesHaveFiniteCoords(deriveGraphFromModel(loopModel));
  });

  it("honours persisted positions for some nodes while dagre lays out the rest", () => {
    const savedX = 500;
    const savedY = 300;
    const graph = deriveGraphFromModel({
      ...twoStageModel,
      graph: {
        version: 1,
        nodes: [{ id: "queue:triage-q", type: "queue", refId: "triage-q", x: savedX, y: savedY }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    const triageQueue = graph.nodes.find(n => n.id === "queue:triage-q");
    expect(triageQueue.x).toBe(savedX);
    expect(triageQueue.y).toBe(savedY);

    // Other nodes should still have valid dagre-computed positions.
    const others = graph.nodes.filter(n => n.id !== "queue:triage-q");
    assertNodesHaveFiniteCoords({ nodes: others });
  });
});
