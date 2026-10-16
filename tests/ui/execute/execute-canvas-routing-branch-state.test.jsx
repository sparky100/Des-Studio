// ExecuteCanvas — conditional-routing branch state. Verifies that a
// state-variable-driven diversion (e.g. icuOpen = 0 → ICU Queue) is rendered
// on the canvas: the live branch is highlighted, the other is dimmed, and the
// highlight switches when the state variable flips.
import { render, screen, within } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import { ExecuteCanvas } from "../../../src/ui/execute/ExecuteCanvas.jsx";
import { deriveGraphFromModel } from "../../../src/ui/visual-designer/graph.js";
import { twoStageClinicModel } from "../../__helpers__/twoStageModel.js";

const h = vi.hoisted(() => ({ edges: null }));

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    ReactFlow: ({ edges, children }) => { h.edges = edges; return <div data-testid="react-flow">{children}</div>; },
    Background: () => null,
    Controls:   () => null,
    Panel:      ({ children }) => <div>{children}</div>,
    Handle:     () => null,
    BaseEdge:   () => null,
    getBezierPath: () => ["M0,0 L100,100"],
    useReactFlow: () => ({
      fitView: vi.fn(),
      getNode: vi.fn(() => null),
      setCenter: vi.fn(),
      getViewport: vi.fn(() => ({ zoom: 1 })),
    }),
  };
});
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx",    () => ({ ExecuteSourceNode:    () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx",     () => ({ ExecuteQueueNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx",  () => ({ ExecuteActivityNode:  () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",      () => ({ ExecuteSinkNode:      () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteContainerNode.jsx", () => ({ ExecuteContainerNode: () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",         () => ({ AnimatedEdge:         () => <line /> }));

const model = {
  ...twoStageClinicModel,
  stateVariables: [{ id: "sv-icu", name: "icuOpen", initialValue: "1" }],
  queues: [...twoStageClinicModel.queues, { id: "icu-q", name: "ICU Queue", customerType: "Patient", discipline: "FIFO" }],
  bEvents: twoStageClinicModel.bEvents.map(e => e.id !== "triage-complete" ? e : {
    ...e,
    effect: "RELEASE(Triage Nurse)",
    routing: [{
      queueName: "ICU Queue",
      condition: { operator: "AND", clauses: [
        { variable: "icuOpen", operator: "==", value: 0 },
        { variable: "queue(Consultant Queue).length", operator: ">", value: 2 },
      ] },
    }],
    defaultQueueName: "Consultant Queue",
  }),
};

const graph = deriveGraphFromModel(model);
const icuEdgeId = graph.edges.find(e => e.source === "routing" && e.to === "queue:icu-q").id;
const consultEdgeId = graph.edges.find(e => e.source === "routing" && e.to === "queue:consult-q" && e.branchIndex === "default").id;

const baseSnap = {
  clock: 10, served: 0, reneged: 0, balked: 0,
  entities: [],
  scalars: { icuOpen: 0 },
  byQueue: {
    "Consultant Queue": { waiting: 5, total: 5 },
    "ICU Queue": { waiting: 0, total: 0 },
    "Triage Queue": { waiting: 0, total: 0 },
  },
};

const edgeById = id => h.edges.find(e => e.id === id);

describe("ExecuteCanvas — conditional routing branch state", () => {
  test("highlights the active branch and dims the inactive one", () => {
    render(<ExecuteCanvas model={model} snap={baseSnap} animationEnabled={false} />);
    const active = edgeById(icuEdgeId);
    const inactive = edgeById(consultEdgeId);
    expect(active.style.strokeWidth).toBe(2.5);
    expect(active.style.opacity).toBe(1);
    expect(inactive.style.opacity).toBe(0.45);
    expect(inactive.style.strokeDasharray).toBe("4 4");
  });

  test("switches the highlight when the state variable flips", () => {
    const { rerender } = render(<ExecuteCanvas model={model} snap={baseSnap} animationEnabled={false} />);
    expect(edgeById(icuEdgeId).style.opacity).toBe(1);

    const openSnap = { ...baseSnap, scalars: { icuOpen: 1 } };
    rerender(<ExecuteCanvas model={model} snap={openSnap} animationEnabled={false} />);
    expect(edgeById(consultEdgeId).style.opacity).toBe(1);
    expect(edgeById(icuEdgeId).style.opacity).toBe(0.45);
  });

  test("leaves routing edges unstyled when the condition is unresolvable", () => {
    const entityModel = {
      ...model,
      bEvents: model.bEvents.map(e => e.id !== "triage-complete" ? e : {
        ...e,
        routing: [{ queueName: "ICU Queue", condition: { variable: "Entity.outcome", operator: "==", value: "ICU" } }],
      }),
    };
    render(<ExecuteCanvas model={entityModel} snap={baseSnap} animationEnabled={false} />);
    expect(edgeById(icuEdgeId).style.opacity).toBeUndefined();
    expect(edgeById(consultEdgeId).style.opacity).toBeUndefined();
  });

  test("shows a switch readout for each state variable, ON/OFF for 0/1", () => {
    const { rerender } = render(<ExecuteCanvas model={model} snap={baseSnap} animationEnabled={false} />);
    const strip = within(screen.getByTestId("switch-strip"));
    expect(strip.getByText("icuOpen")).toBeInTheDocument();
    expect(strip.getByText("OFF")).toBeInTheDocument();

    rerender(<ExecuteCanvas model={model} snap={{ ...baseSnap, scalars: { icuOpen: 1 } }} animationEnabled={false} />);
    expect(within(screen.getByTestId("switch-strip")).getByText("ON")).toBeInTheDocument();
  });

  test("formats numeric switch values by magnitude", () => {
    const numModel = { ...model, stateVariables: [{ name: "cost", initialValue: "0" }, { name: "rate", initialValue: "0" }, { name: "share", initialValue: "0" }] };
    render(<ExecuteCanvas model={numModel} snap={{ ...baseSnap, scalars: { cost: 20387362.034938715, rate: 4.2468, share: 0.37249 } }} animationEnabled={false} />);
    const strip = within(screen.getByTestId("switch-strip"));
    expect(strip.getByText("20,387,362")).toBeInTheDocument();
    expect(strip.getByText("4.2")).toBeInTheDocument();
    expect(strip.getByText("0.37")).toBeInTheDocument();
  });

  test("omits variables the modeller hid from the Switches panel", () => {
    const curatedModel = {
      ...model,
      stateVariables: [
        { id: "sv-icu", name: "icuOpen", initialValue: "1" },
        { id: "sv-arr", name: "arrivals", initialValue: "0", showInSwitches: false },
      ],
    };
    render(<ExecuteCanvas model={curatedModel} snap={{ ...baseSnap, scalars: { icuOpen: 1, arrivals: 7 } }} animationEnabled={false} />);
    const strip = within(screen.getByTestId("switch-strip"));
    expect(strip.getByText("icuOpen")).toBeInTheDocument();
    expect(strip.queryByText("arrivals")).not.toBeInTheDocument();
  });

  test("renders no Switches panel when every variable is hidden", () => {
    const hiddenModel = {
      ...model,
      stateVariables: [{ id: "sv-icu", name: "icuOpen", initialValue: "1", showInSwitches: false }],
    };
    render(<ExecuteCanvas model={hiddenModel} snap={{ ...baseSnap, scalars: { icuOpen: 1 } }} animationEnabled={false} />);
    expect(screen.queryByTestId("switch-strip")).not.toBeInTheDocument();
  });
});
