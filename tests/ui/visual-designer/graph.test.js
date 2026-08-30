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

  it("derives queue->activity edge when condition is normalized to object form", () => {
    // Regression guard: db/models.js's norm() converts string conditions to
    // { operator, clauses: [...] } via normalizeModelConditions() on every model
    // load. The clause "variable" stays in the queue(...)/idle(...) dialect, so
    // graph.js must recognize that dialect, not just the legacy Queue.X.length one.
    const model = {
      ...minimalModel,
      cEvents: [
        {
          ...minimalModel.cEvents[0],
          condition: {
            operator: "AND",
            clauses: [
              { variable: "queue(Waiting).length", operator: ">", value: 0 },
              { variable: "idle(Server).count", operator: ">", value: 0 },
            ],
          },
        },
      ],
    };
    const graph = deriveGraphFromModel(model);
    const edgePairs = graph.edges.map(edge => `${edge.from}->${edge.to}`);
    expect(edgePairs).toContain("queue:waiting->activity:start-service");
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

describe("deriveGraphFromModel — container nodes", () => {
  it("emits one container node per declared container, with zero edges", () => {
    const model = {
      ...minimalModel,
      containerTypes: [
        { id: "Tank", capacity: "1000", initialLevel: "500" },
        { id: "Buffer", capacity: null, initialLevel: 0 },
      ],
    };
    const graph = deriveGraphFromModel(model);

    const containerNodes = graph.nodes.filter(node => node.type === "container");
    expect(containerNodes).toHaveLength(2);
    expect(containerNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "container:Tank", type: "container", refId: "Tank", sublabel: "cap 1000, start 500" }),
      expect.objectContaining({ id: "container:Buffer", type: "container", refId: "Buffer", sublabel: "unbounded" }),
    ]));

    // Containers don't participate in entity flow — no edge should touch them.
    const containerNodeIds = new Set(containerNodes.map(node => node.id));
    expect(graph.edges.some(edge => containerNodeIds.has(edge.from) || containerNodeIds.has(edge.to))).toBe(false);
  });

  it("gives container nodes finite layout coordinates", () => {
    const model = {
      ...minimalModel,
      containerTypes: [{ id: "Tank", capacity: "1000", initialLevel: "500" }],
    };
    const graph = deriveGraphFromModel(model);
    assertNodesHaveFiniteCoords({ nodes: graph.nodes.filter(node => node.type === "container") });
  });

  it("produces no container nodes when none are declared", () => {
    const graph = deriveGraphFromModel(minimalModel);
    expect(graph.nodes.some(node => node.type === "container")).toBe(false);
  });
});

describe("deriveGraphFromModel — JOIN/SPLIT/MATCH/UNBATCH/COSEIZE/BATCH edges", () => {
  it("derives incoming and outgoing edges for a JOIN(Source, Target) C-event effect", () => {
    const model = {
      queues: [
        { id: "source-q", name: "Source Queue", customerType: "Item", discipline: "FIFO" },
        { id: "target-q", name: "Target Queue", customerType: "Item", discipline: "FIFO" },
      ],
      bEvents: [],
      cEvents: [{
        id: "join-op", name: "Join Items", priority: 1,
        condition: "queue(Source Queue).length > 0",
        effect: "JOIN(Source Queue, Target Queue)",
        cSchedules: [],
      }],
    };
    const graph = deriveGraphFromModel(model);
    const edgePairs = graph.edges.map(e => `${e.from}->${e.to}`);
    expect(edgePairs).toContain("queue:source-q->activity:join-op");
    expect(edgePairs).toContain("activity:join-op->queue:target-q");
    expect(graph.edges.find(e => e.from === "activity:join-op" && e.to === "queue:target-q").source).toBe("routing");
  });

  it("derives an outgoing edge for a SPLIT(...) call inside a cSchedule-linked bEvent effect", () => {
    const model = {
      queues: [
        { id: "intake-q", name: "IntakeQueue", customerType: "BulkOrder", discipline: "FIFO" },
        { id: "pick-q", name: "PickQueue", customerType: "Item", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "intake-done", name: "Intake Split", scheduledTime: "9999",
          effect: ["SPLIT(Item, 4, PickQueue)", "COMPLETE()"], schedules: [] },
      ],
      cEvents: [{
        id: "intake", name: "Intake Order", priority: 1,
        condition: "queue(IntakeQueue).length > 0",
        effect: "ASSIGN(IntakeQueue, Clerk)",
        cSchedules: [{ eventId: "intake-done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      }],
    };
    const graph = deriveGraphFromModel(model);
    expect(graph.edges.map(e => `${e.from}->${e.to}`)).toContain("activity:intake->queue:pick-q");
  });

  it("derives incoming edges from both source queues and one outgoing edge for a MATCH C-event effect", () => {
    const model = {
      queues: [
        { id: "order-q", name: "OrderQueue", customerType: "Order", discipline: "FIFO" },
        { id: "item-q", name: "ItemQueue", customerType: "Item", discipline: "FIFO" },
        { id: "fulfillment-q", name: "FulfillmentQueue", customerType: "Order", discipline: "FIFO" },
      ],
      bEvents: [],
      cEvents: [{
        id: "match-op", name: "Match Order with Item", priority: 1,
        condition: "queue(OrderQueue).length > 0 AND queue(ItemQueue).length > 0",
        effect: "MATCH(Order, OrderQueue, Item, ItemQueue, FulfillmentQueue)",
        cSchedules: [],
      }],
    };
    const graph = deriveGraphFromModel(model);
    const edgePairs = graph.edges.map(e => `${e.from}->${e.to}`);
    expect(edgePairs).toContain("queue:order-q->activity:match-op");
    expect(edgePairs).toContain("queue:item-q->activity:match-op");
    expect(edgePairs).toContain("activity:match-op->queue:fulfillment-q");
  });

  it("derives an outgoing edge for an UNBATCH(...) call inside a cSchedule-linked bEvent effect", () => {
    const model = {
      queues: [
        { id: "batch-q", name: "BatchQueue", customerType: "Part", discipline: "FIFO" },
        { id: "restored-q", name: "RestoredQueue", customerType: "Part", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "unbatch-done", name: "Unbatch", scheduledTime: "9999", effect: "UNBATCH(RestoredQueue)", schedules: [] },
      ],
      cEvents: [{
        id: "unbatch-op", name: "Unbatch Op", priority: 1,
        condition: "queue(BatchQueue).length > 0",
        effect: "DELAY(BatchQueue)",
        cSchedules: [{ eventId: "unbatch-done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      }],
    };
    const graph = deriveGraphFromModel(model);
    expect(graph.edges.map(e => `${e.from}->${e.to}`)).toContain("activity:unbatch-op->queue:restored-q");
  });

  it("treats a FINISH-only bEvent like COMPLETE for sink creation and sublabel", () => {
    const model = {
      queues: [{ id: "q", name: "Queue", customerType: "Customer", discipline: "FIFO" }],
      bEvents: [{ id: "finish-done", name: "Finish", scheduledTime: "9999", effect: "FINISH(Server)", schedules: [] }],
      cEvents: [{
        id: "svc", name: "Serve", priority: 1,
        condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
        effect: "ASSIGN(Queue, Server)",
        cSchedules: [{ eventId: "finish-done", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      }],
    };
    const graph = deriveGraphFromModel(model);
    const sink = graph.nodes.find(n => n.id === "sink:finish-done");
    expect(sink.sublabel).toBe("Completion exit");
    expect(graph.edges.map(e => `${e.from}->${e.to}`)).toContain("activity:svc->sink:finish-done");
  });

  it("derives a terminal edge and a reneging-exit sublabel for RENEGE_OLDEST combined with RELEASE in the same bEvent effect", () => {
    const model = {
      queues: [{ id: "q", name: "Queue", customerType: "Customer", discipline: "FIFO" }],
      bEvents: [{
        id: "release-and-renege", name: "Release And Renege Oldest", scheduledTime: "9999",
        effect: ["RELEASE(Server, Queue)", "RENEGE_OLDEST(Customer)"], schedules: [],
      }],
      cEvents: [{
        id: "svc", name: "Serve", priority: 1,
        condition: "queue(Queue).length > 0 AND idle(Server).count > 0",
        effect: "ASSIGN(Queue, Server)",
        cSchedules: [{ eventId: "release-and-renege", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
      }],
    };
    const graph = deriveGraphFromModel(model);
    expect(graph.edges.map(e => `${e.from}->${e.to}`)).toContain("activity:svc->sink:release-and-renege");
    expect(graph.nodes.find(n => n.id === "sink:release-and-renege").sublabel).toBe("Reneging exit");
  });

  it("derives an incoming edge for a COSEIZE source queue even when the condition text doesn't repeat the queue name", () => {
    const model = {
      queues: [{ id: "surgery-q", name: "SurgeryQueue", customerType: "Patient", discipline: "FIFO" }],
      bEvents: [],
      cEvents: [{
        id: "surgery", name: "Perform Surgery", priority: 1,
        condition: "idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0", // no "SurgeryQueue" mention
        effect: "COSEIZE(SurgeryQueue, Surgeon, Anesthetist)",
        cSchedules: [],
      }],
    };
    const graph = deriveGraphFromModel(model);
    expect(graph.edges.map(e => `${e.from}->${e.to}`)).toContain("queue:surgery-q->activity:surgery");
  });

  it("derives an incoming edge for a BATCH source queue independent of condition text", () => {
    const model = {
      queues: [{ id: "parts-q", name: "Parts", customerType: "Part", discipline: "FIFO" }],
      bEvents: [],
      cEvents: [{
        id: "batch-op", name: "Batch Parts", priority: 1,
        condition: { variable: "clock", operator: ">", value: 0 }, // no queue reference at all
        effect: "BATCH(Parts, 3)",
        cSchedules: [],
      }],
    };
    const graph = deriveGraphFromModel(model);
    expect(graph.edges.map(e => `${e.from}->${e.to}`)).toContain("queue:parts-q->activity:batch-op");
  });

  it("derives a fallback exit edge when a RELEASE routing table's defaultQueueName is explicitly null", () => {
    const model = {
      ...twoStageModel,
      bEvents: twoStageModel.bEvents.map(event =>
        event.id === "triage-complete"
          ? {
              ...event,
              effect: "RELEASE(Triage Nurse)",
              routing: [{ condition: { variable: "Entity.outcome", operator: "==", value: "ICU" }, queueName: "Consultant Queue" }],
              defaultQueueName: null,
            }
          : event
      ),
    };
    const graph = deriveGraphFromModel(model);
    const edge = graph.edges.find(e => e.from === "activity:start-triage" && e.label === "default");
    expect(edge).toBeDefined();
    expect(edge.source).toBe("terminal");
    expect(edge.to).toBe("sink:exit-triage-complete");
  });
});

describe("deriveGraphFromModel — back-edge detection (F12.6)", () => {
  it("marks zero edges loop:true for a fork/join diamond (two independent activities feeding the same downstream queue)", () => {
    const model = {
      queues: [
        { id: "repair-q", name: "Repair Queue", customerType: "Customer", discipline: "FIFO" },
        { id: "away-q", name: "Customer Away Queue", customerType: "Customer", discipline: "FIFO" },
        { id: "pickup-q", name: "Pickup Rendezvous Queue", customerType: "Customer", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "repair-complete", name: "Repair Complete", scheduledTime: "9999",
          effect: "RELEASE(RepairTech, Pickup Rendezvous Queue)", schedules: [] },
        { id: "timeaway-complete", name: "Time Away Complete", scheduledTime: "9999",
          effect: "", schedules: [],
          probabilisticRouting: [{ probability: 1, queueName: "Pickup Rendezvous Queue" }] },
      ],
      cEvents: [
        { id: "repair", name: "Repair", priority: 1,
          condition: "queue(Repair Queue).length > 0 AND idle(RepairTech).count > 0",
          effect: "ASSIGN(Repair Queue, RepairTech)",
          cSchedules: [{ eventId: "repair-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
        { id: "timeaway", name: "Time Away", priority: 2,
          condition: "queue(Customer Away Queue).length > 0",
          effect: "DELAY(Customer Away Queue)",
          cSchedules: [{ eventId: "timeaway-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
      ],
    };
    const graph = deriveGraphFromModel(model);
    const edgePairs = graph.edges.map(e => `${e.from}->${e.to}`);
    expect(edgePairs).toContain("activity:repair->queue:pickup-q");
    expect(edgePairs).toContain("activity:timeaway->queue:pickup-q");
    expect(graph.edges.filter(e => e.loop)).toHaveLength(0);
  });

  it("marks exactly the one true back edge in a genuine two-stage rework cycle, not the forward edges", () => {
    const model = {
      queues: [
        { id: "q-a", name: "Queue A", customerType: "Patient", discipline: "FIFO" },
        { id: "q-b", name: "Queue B", customerType: "Patient", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "b1-complete", name: "B1 Complete", scheduledTime: "9999", effect: "RELEASE(Server1, Queue B)", schedules: [] },
        { id: "b2-complete", name: "B2 Complete", scheduledTime: "9999", effect: "RELEASE(Server2, Queue A)", schedules: [] },
      ],
      cEvents: [
        { id: "activity1", name: "Activity 1", priority: 1,
          condition: "queue(Queue A).length > 0 AND idle(Server1).count > 0",
          effect: "ASSIGN(Queue A, Server1)",
          cSchedules: [{ eventId: "b1-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
        { id: "activity2", name: "Activity 2", priority: 2,
          condition: "queue(Queue B).length > 0 AND idle(Server2).count > 0",
          effect: "ASSIGN(Queue B, Server2)",
          cSchedules: [{ eventId: "b2-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
      ],
    };
    const graph = deriveGraphFromModel(model);
    const loopEdges = graph.edges.filter(e => e.loop);
    expect(loopEdges).toHaveLength(1);
    expect(loopEdges[0]).toEqual(expect.objectContaining({
      from: "activity:activity2", to: "queue:q-a", maxLoopCount: 3, exitQueueName: null,
    }));
    expect(graph.edges.find(e => e.from === "queue:q-a" && e.to === "activity:activity1").loop).toBeFalsy();
    expect(graph.edges.find(e => e.from === "activity:activity1" && e.to === "queue:q-b").loop).toBeFalsy();
    expect(graph.edges.find(e => e.from === "queue:q-b" && e.to === "activity:activity2").loop).toBeFalsy();
  });

  it("does not mark a diamond's join edges even when an unrelated cycle exists elsewhere in the same model", () => {
    const model = {
      queues: [
        { id: "repair-q", name: "Repair Queue", customerType: "Customer", discipline: "FIFO" },
        { id: "away-q", name: "Customer Away Queue", customerType: "Customer", discipline: "FIFO" },
        { id: "pickup-q", name: "Pickup Rendezvous Queue", customerType: "Customer", discipline: "FIFO" },
        { id: "q-a", name: "Queue A", customerType: "Patient", discipline: "FIFO" },
        { id: "q-b", name: "Queue B", customerType: "Patient", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "repair-complete", name: "Repair Complete", scheduledTime: "9999",
          effect: "RELEASE(RepairTech, Pickup Rendezvous Queue)", schedules: [] },
        { id: "timeaway-complete", name: "Time Away Complete", scheduledTime: "9999",
          effect: "", schedules: [],
          probabilisticRouting: [{ probability: 1, queueName: "Pickup Rendezvous Queue" }] },
        { id: "b1-complete", name: "B1 Complete", scheduledTime: "9999", effect: "RELEASE(Server1, Queue B)", schedules: [] },
        { id: "b2-complete", name: "B2 Complete", scheduledTime: "9999", effect: "RELEASE(Server2, Queue A)", schedules: [] },
      ],
      cEvents: [
        { id: "repair", name: "Repair", priority: 1,
          condition: "queue(Repair Queue).length > 0 AND idle(RepairTech).count > 0",
          effect: "ASSIGN(Repair Queue, RepairTech)",
          cSchedules: [{ eventId: "repair-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
        { id: "timeaway", name: "Time Away", priority: 2,
          condition: "queue(Customer Away Queue).length > 0",
          effect: "DELAY(Customer Away Queue)",
          cSchedules: [{ eventId: "timeaway-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
        { id: "activity1", name: "Activity 1", priority: 3,
          condition: "queue(Queue A).length > 0 AND idle(Server1).count > 0",
          effect: "ASSIGN(Queue A, Server1)",
          cSchedules: [{ eventId: "b1-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
        { id: "activity2", name: "Activity 2", priority: 4,
          condition: "queue(Queue B).length > 0 AND idle(Server2).count > 0",
          effect: "ASSIGN(Queue B, Server2)",
          cSchedules: [{ eventId: "b2-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }] },
      ],
    };
    const graph = deriveGraphFromModel(model);
    const loopEdges = graph.edges.filter(e => e.loop);
    expect(loopEdges).toHaveLength(1);
    expect(loopEdges[0]).toEqual(expect.objectContaining({ from: "activity:activity2", to: "queue:q-a" }));
    expect(graph.edges.find(e => e.from === "activity:repair" && e.to === "queue:pickup-q").loop).toBeFalsy();
    expect(graph.edges.find(e => e.from === "activity:timeaway" && e.to === "queue:pickup-q").loop).toBeFalsy();
  });
});

// Standard-size Draw nodes freed up room for extra "at a glance" design-time
// info — see docs plan for the node-sizing change. These cover the new
// data.detail line and the discipline/route-count badges built on top of it.
describe("deriveGraphFromModel — canvas detail lines and badges", () => {
  it("always shows a discipline badge on queue nodes, defaulting to FIFO", () => {
    const graph = deriveGraphFromModel(minimalModel); // queue discipline: "FIFO"
    const queue = graph.nodes.find(n => n.id === "queue:waiting");
    expect(queue.badges).toEqual(["FIFO"]);
  });

  it("defaults the discipline badge to FIFO when the queue omits discipline", () => {
    const model = {
      ...minimalModel,
      queues: [{ id: "waiting", name: "Waiting", customerType: "Customer" }],
    };
    const graph = deriveGraphFromModel(model);
    const queue = graph.nodes.find(n => n.id === "queue:waiting");
    expect(queue.badges).toEqual(["FIFO"]);
  });

  it("shows a custom discipline badge verbatim, e.g. a priority-attribute queue", () => {
    const model = {
      ...minimalModel,
      queues: [{ id: "waiting", name: "Waiting", customerType: "Customer", discipline: "PRIORITY(severity)" }],
    };
    const graph = deriveGraphFromModel(model);
    const queue = graph.nodes.find(n => n.id === "queue:waiting");
    expect(queue.badges).toEqual(["PRIORITY(severity)"]);
  });

  it("shows no capacity detail line for an uncapacitated queue", () => {
    const graph = deriveGraphFromModel(minimalModel);
    const queue = graph.nodes.find(n => n.id === "queue:waiting");
    expect(queue.detail).toBeUndefined();
  });

  it("shows a capacity detail line, plus overflow destination when set", () => {
    const model = {
      ...minimalModel,
      queues: [{
        id: "waiting", name: "Waiting", customerType: "Customer", discipline: "FIFO",
        capacity: "12", overflowDestination: "Overflow Queue",
      }],
    };
    const graph = deriveGraphFromModel(model);
    const queue = graph.nodes.find(n => n.id === "queue:waiting");
    expect(queue.detail).toBe("cap 12 → Overflow Queue");
  });

  it("shows the source's inter-arrival distribution as a detail line when declared", () => {
    const model = {
      ...minimalModel,
      bEvents: [
        { ...minimalModel.bEvents[0], schedules: [{ dist: "Exponential", distParams: { rate: 0.5 } }] },
        minimalModel.bEvents[1],
      ],
    };
    const graph = deriveGraphFromModel(model);
    const source = graph.nodes.find(n => n.type === "source");
    expect(source.detail).toBe("Exp(λ=0.5)");
  });

  it("leaves the source detail line unset when no inter-arrival distribution is declared", () => {
    const graph = deriveGraphFromModel(minimalModel); // bEvents[0].schedules: []
    const source = graph.nodes.find(n => n.type === "source");
    expect(source.detail).toBeUndefined();
  });

  it("shows the activity's service-time distribution as a detail line", () => {
    const graph = deriveGraphFromModel(minimalModel); // cSchedules[0]: Fixed(1)
    const activity = graph.nodes.find(n => n.id === "activity:start-service");
    expect(activity.detail).toBe("Fixed(1)");
  });

  it("does not badge a single-destination activity with a route count", () => {
    const graph = deriveGraphFromModel(twoStageModel);
    const activity = graph.nodes.find(n => n.id === "activity:start-triage");
    expect(activity.badges.some(b => /route/.test(b))).toBe(false);
  });

  it("badges a branching activity with its route count", () => {
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
    const activity = graph.nodes.find(n => n.id === "activity:start-triage");
    expect(activity.badges).toContain("2 routes");
  });
});
