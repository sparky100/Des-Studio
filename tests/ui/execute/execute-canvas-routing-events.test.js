// detectRoutingEvents — the Execute canvas's snap-diff logic that decides
// which edge to animate an entity token along. Covers the two bugs found
// investigating "is animation visible for probabilistic routing":
//   1. routing hops (plain/conditional/probabilistic) never animated at all
//   2. completion animation matched the FIRST terminal edge anywhere in the
//      whole graph, not the one the entity actually passed through
import { describe, test, expect, vi } from "vitest";
import { detectRoutingEvents } from "../../../src/ui/execute/ExecuteCanvas.jsx";
import { deriveGraphFromModel } from "../../../src/ui/visual-designer/graph.js";
import { twoStageClinicModel } from "../../__helpers__/twoStageModel.js";

// This file only calls the exported pure function and never renders
// ExecuteCanvas, but importing the module still evaluates its top-level
// @xyflow/react import. Left unmocked, that can leak the real module into a
// sibling test file's mocked scope within the same worker (the documented
// xyflow mock-isolation flake — see execute-canvas-f9c6.test.jsx) — mock it
// here too, matching every other file that imports this module.
vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    ReactFlow: () => null,
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }) => children,
    Handle: () => null,
    BaseEdge: () => null,
    getBezierPath: () => ["M0,0 L100,100"],
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNode: vi.fn(() => null),
      setCenter: vi.fn(),
      getViewport: vi.fn(() => ({ zoom: 1 })),
    }),
  };
});

function findEdge(graph, matcher) {
  const edge = graph.edges.find(matcher);
  expect(edge, `expected a matching edge in ${JSON.stringify(graph.edges.map(e => ({ id: e.id, source: e.source, from: e.from, to: e.to })))}`).toBeTruthy();
  return edge;
}

describe("detectRoutingEvents — arrival and seize (unchanged behaviour)", () => {
  test("a new entity animates the arrival edge into its queue", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const prevSnap = { entities: [] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "waiting", queue: "Triage Queue" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const arrivalEdge = findEdge(graph, e => e.source === "arrival" && e.to === "queue:triage-q");
    expect(events).toEqual([{ edgeId: arrivalEdge.id, entityType: "Patient" }]);
  });

  test("an entity seized from its queue animates the condition edge into the activity", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "waiting", queue: "Triage Queue" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const conditionEdge = findEdge(graph, e => e.source === "condition" && e.to === "activity:start-triage");
    expect(events).toEqual([{ edgeId: conditionEdge.id, entityType: "Patient" }]);
  });
});

describe("detectRoutingEvents — routing hops (the previously-missing case)", () => {
  test("a plain single-destination RELEASE hop still animates (regression guard)", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    // twoStageClinicModel's triage-complete is RELEASE(Triage Nurse, Consultant Queue)
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "waiting", queue: "Consultant Queue" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const routingEdge = findEdge(graph, e =>
      e.source === "routing" && e.from === "activity:start-triage" && e.to === "queue:consult-q");
    expect(events).toEqual([{ edgeId: routingEdge.id, entityType: "Patient" }]);
  });

  test("a probabilistic-routing branch hop animates the branch actually taken", () => {
    const model = {
      ...twoStageClinicModel,
      queues: [...twoStageClinicModel.queues, { id: "icu-q", name: "ICU Queue", customerType: "Patient", discipline: "FIFO" }],
      bEvents: twoStageClinicModel.bEvents.map(event => event.id !== "triage-complete" ? event : {
        ...event,
        effect: "RELEASE(Triage Nurse)",
        probabilisticRouting: [
          { probability: 0.5, queueName: "Consultant Queue" },
          { probability: 0.5, queueName: "ICU Queue" },
        ],
      }),
    };
    const graph = deriveGraphFromModel(model);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "waiting", queue: "ICU Queue" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const icuEdge = findEdge(graph, e =>
      e.source === "routing" && e.from === "activity:start-triage" && e.to === "queue:icu-q");
    const consultEdge = findEdge(graph, e =>
      e.source === "routing" && e.from === "activity:start-triage" && e.to === "queue:consult-q");
    expect(events).toEqual([{ edgeId: icuEdge.id, entityType: "Patient" }]);
    expect(icuEdge.id).not.toBe(consultEdge.id);
  });

  test("a conditional-routing table hop animates", () => {
    const model = {
      ...twoStageClinicModel,
      queues: [...twoStageClinicModel.queues, { id: "icu-q", name: "ICU Queue", customerType: "Patient", discipline: "FIFO" }],
      bEvents: twoStageClinicModel.bEvents.map(event => event.id !== "triage-complete" ? event : {
        ...event,
        effect: "RELEASE(Triage Nurse)",
        routing: [{ condition: { variable: "Entity.outcome", operator: "==", value: "ICU" }, queueName: "ICU Queue" }],
        defaultQueueName: "Consultant Queue",
      }),
    };
    const graph = deriveGraphFromModel(model);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "waiting", queue: "ICU Queue" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const icuEdge = findEdge(graph, e =>
      e.source === "routing" && e.from === "activity:start-triage" && e.to === "queue:icu-q");
    expect(events).toEqual([{ edgeId: icuEdge.id, entityType: "Patient" }]);
  });

  test("an exit branch (queueName: null) animates the terminal edge to the direct-exit sink", () => {
    const model = {
      ...twoStageClinicModel,
      bEvents: twoStageClinicModel.bEvents.map(event => event.id !== "triage-complete" ? event : {
        ...event,
        effect: "RELEASE(Triage Nurse)",
        probabilisticRouting: [{ probability: 1, queueName: null }],
      }),
    };
    const graph = deriveGraphFromModel(model);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "done" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const exitEdge = findEdge(graph, e => e.source === "terminal" && e.from === "activity:start-triage");
    expect(events).toEqual([{ edgeId: exitEdge.id, entityType: "Patient" }]);
  });
});

describe("detectRoutingEvents — completion is scoped to the entity's own activity (bug fix)", () => {
  test("an entity finishing one activity animates THAT activity's sink, not another activity's", () => {
    // Two independent single-stage chains sharing no queues, each with its
    // own completion edge — the pre-fix code matched the FIRST terminal edge
    // anywhere in the whole graph regardless of which activity fired.
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "clerkA", name: "Clerk A", role: "server", count: 1, attrDefs: [] },
        { id: "clerkB", name: "Clerk B", role: "server", count: 1, attrDefs: [] },
      ],
      queues: [
        { id: "qa", name: "Queue A", customerType: "Patient", discipline: "FIFO" },
        { id: "qb", name: "Queue B", customerType: "Patient", discipline: "FIFO" },
      ],
      stateVariables: [],
      bEvents: [
        { id: "arriveA", name: "Arrival A", scheduledTime: "0", effect: "ARRIVE(Patient, Queue A)", schedules: [] },
        { id: "arriveB", name: "Arrival B", scheduledTime: "0", effect: "ARRIVE(Patient, Queue B)", schedules: [] },
        { id: "completeA", name: "Complete A", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
        { id: "completeB", name: "Complete B", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        {
          id: "serveA", name: "Serve A", priority: 1,
          condition: "queue(Queue A).length > 0 AND idle(Clerk A).count > 0",
          effect: "ASSIGN(Queue A, Clerk A)",
          cSchedules: [{ eventId: "completeA", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
        {
          id: "serveB", name: "Serve B", priority: 2,
          condition: "queue(Queue B).length > 0 AND idle(Clerk B).count > 0",
          effect: "ASSIGN(Queue B, Clerk B)",
          cSchedules: [{ eventId: "completeB", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
        },
      ],
    };
    const graph = deriveGraphFromModel(model);

    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Queue B" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "done" }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const terminalB = findEdge(graph, e => e.source === "terminal" && e.from === "activity:serveB");
    const terminalA = findEdge(graph, e => e.source === "terminal" && e.from === "activity:serveA");
    expect(events).toEqual([{ edgeId: terminalB.id, entityType: "Patient" }]);
    expect(terminalB.id).not.toBe(terminalA.id);
  });

  test("an entity reneging directly out of a queue (never entering an activity) animates nothing", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "waiting", queue: "Triage Queue" }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "reneged" }] };

    expect(detectRoutingEvents(prevSnap, currSnap, graph)).toEqual([]);
  });
});

describe("detectRoutingEvents — same-cycle re-seize (the states a real run actually shows)", () => {
  // The engine snapshots once per A→B→C cycle, AFTER Phase C — so on a
  // non-saturated model a routed entity is re-claimed before any snapshot and
  // consecutive snaps show serving→serving with a changed lastQueue.
  test("serving→serving with a new lastQueue animates the routing hop AND the seize", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue", serviceStart: 2 }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Consultant Queue", serviceStart: 7 }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const routingEdge = findEdge(graph, e =>
      e.source === "routing" && e.from === "activity:start-triage" && e.to === "queue:consult-q");
    const seizeEdge = findEdge(graph, e =>
      e.source === "condition" && e.from === "queue:consult-q" && e.to === "activity:start-consult");
    expect(events).toEqual([
      { edgeId: routingEdge.id, entityType: "Patient" },
      { edgeId: seizeEdge.id, entityType: "Patient" },
    ]);
  });

  test("a changed serviceStart with an unchanged lastQueue (same-queue loop-back) still animates", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const prevSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue", serviceStart: 2 }] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue", serviceStart: 9 }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    // No loop edge exists in this fixture, but the re-seize into the same
    // queue's activity must still animate the condition edge.
    const seizeEdge = findEdge(graph, e =>
      e.source === "condition" && e.from === "queue:triage-q");
    expect(events).toEqual([{ edgeId: seizeEdge.id, entityType: "Patient" }]);
  });

  test("an unchanged active entity (still mid-service) animates nothing", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const entity = { id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue", serviceStart: 2 };
    expect(detectRoutingEvents({ entities: [entity] }, { entities: [{ ...entity }] }, graph)).toEqual([]);
  });

  test("a new entity seized in its arrival cycle animates the arrival AND the seize", () => {
    const graph = deriveGraphFromModel(twoStageClinicModel);
    const prevSnap = { entities: [] };
    const currSnap = { entities: [{ id: 1, type: "Patient", role: "customer", status: "serving", lastQueue: "Triage Queue", serviceStart: 0 }] };

    const events = detectRoutingEvents(prevSnap, currSnap, graph);

    const arrivalEdge = findEdge(graph, e => e.source === "arrival" && e.to === "queue:triage-q");
    const seizeEdge = findEdge(graph, e => e.source === "condition" && e.from === "queue:triage-q");
    expect(events).toEqual([
      { edgeId: arrivalEdge.id, entityType: "Patient" },
      { edgeId: seizeEdge.id, entityType: "Patient" },
    ]);
  });
});
