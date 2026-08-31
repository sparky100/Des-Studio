// ExecuteCanvas's source node computes arrivalKey (pulse-detection signal)
// from parseArriveCustomerType(bEvent) matched against real entity types —
// parseArriveCustomerType used to be a local, incomplete reimplementation of
// model/macroParser.js's effectText (missing the effect.effect string-wrapper
// and args-less-object shapes), so a b-event whose ARRIVE effect used either
// shape silently resolved to no customer type at all: arrivalKey stayed 0
// forever regardless of real arrivals, so the source node's arrival pulse
// never fired. Confirms both shapes now resolve correctly.
import { render, screen, within } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import { ExecuteCanvas } from "../../../src/ui/execute/ExecuteCanvas.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    ReactFlow: ({ children, nodes, nodeTypes }) => (
      <div data-testid="react-flow">
        {nodes.map(node => {
          const Comp = nodeTypes[node.type] || (() => null);
          return <Comp key={node.id} data={node.data} />;
        })}
        {children}
      </div>
    ),
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
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx",    () => ({ ExecuteQueueNode:    () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",     () => ({ ExecuteSinkNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => null }));
// Expose the internal liveData.arrivalKey this test is actually verifying,
// instead of asserting on the pulse animation it drives.
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx", () => ({
  ExecuteSourceNode: ({ data }) => <div>arrivalKey:{data.liveData?.arrivalKey ?? "none"}</div>,
}));

const baseModel = {
  cEvents: [],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [{ id: "et1", name: "Customer", role: "customer" }],
};

const makeSnap = (extra = {}) => ({
  clock: 10, served: 0, reneged: 0, balked: 0,
  entities: [{ id: 7, type: "Customer", role: "customer" }],
  nextArrivals: {}, byType: {}, eventCounts: {},
  ...extra,
});

describe("ExecuteCanvas — source arrivalKey across ARRIVE effect shapes", () => {
  test("resolves the customer type (and a non-zero arrivalKey) for an effect.effect string-wrapper object", () => {
    const model = {
      ...baseModel,
      bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: { effect: "ARRIVE(Customer, Queue A)" } }],
    };
    render(<ExecuteCanvas model={model} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("arrivalKey:7")).toBeInTheDocument();
  });

  test("resolves the customer type for an args-less object effect with individual named fields", () => {
    const model = {
      ...baseModel,
      bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: { macro: "ARRIVE", entityType: "Customer", queue: "Queue A" } }],
    };
    render(<ExecuteCanvas model={model} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("arrivalKey:7")).toBeInTheDocument();
  });

  test("plain string ARRIVE effect still resolves (regression guard)", () => {
    const model = {
      ...baseModel,
      bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" }],
    };
    render(<ExecuteCanvas model={model} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("arrivalKey:7")).toBeInTheDocument();
  });
});
