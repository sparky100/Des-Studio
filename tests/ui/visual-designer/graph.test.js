import { describe, expect, it } from "vitest";
import { deriveGraphFromModel, graphLayoutFromDerivedGraph } from "../../../src/ui/visual-designer/graph.js";

const twoStageModel = {
  entityTypes: [
    { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
    { id: "triage", name: "Triage Nurse", role: "server", count: 1, attrDefs: [] },
    { id: "consultant", name: "Consultant", role: "server", count: 1, attrDefs: [] },
  ],
  queues: [
    { id: "triage-q", name: "Triage Queue", customerType: "Patient", discipline: "FIFO" },
    { id: "consult-q", name: "Consultant Queue", customerType: "Patient", discipline: "FIFO" },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: "arrive",
      name: "Patient Arrival",
      scheduledTime: "0",
      effect: "ARRIVE(Patient, Triage Queue)",
      schedules: [],
    },
    {
      id: "triage-complete",
      name: "Triage Complete",
      scheduledTime: "9999",
      effect: "RELEASE(Triage Nurse, Consultant Queue)",
      schedules: [],
    },
    {
      id: "consult-complete",
      name: "Consultation Complete",
      scheduledTime: "9999",
      effect: "COMPLETE()",
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: "start-triage",
      name: "Start Triage",
      priority: 1,
      condition: "queue(Triage Queue).length > 0 AND idle(Triage Nurse).count > 0",
      effect: "ASSIGN(Triage Queue, Triage Nurse)",
      cSchedules: [{ eventId: "triage-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    },
    {
      id: "start-consult",
      name: "Start Consultation",
      priority: 2,
      condition: "queue(Consultant Queue).length > 0 AND idle(Consultant).count > 0",
      effect: "ASSIGN(Consultant Queue, Consultant)",
      cSchedules: [{ eventId: "consult-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    },
  ],
};

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

  it("derives visual edges from ARRIVE, ASSIGN, RELEASE, and COMPLETE logic", () => {
    const graph = deriveGraphFromModel(twoStageModel);
    const edgePairs = graph.edges.map(edge => `${edge.from}->${edge.to}`);

    expect(edgePairs).toContain("source:arrive-0->queue:triage-q");
    expect(edgePairs).toContain("queue:triage-q->activity:start-triage");
    expect(edgePairs).toContain("activity:start-triage->queue:consult-q");
    expect(edgePairs).toContain("queue:consult-q->activity:start-consult");
    expect(edgePairs).toContain("activity:start-consult->sink:consult-complete");
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

    expect(Math.min(...xValues)).toBe(40);
    expect(Math.max(...xValues)).toBeLessThanOrEqual(610);
    expect(graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
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
