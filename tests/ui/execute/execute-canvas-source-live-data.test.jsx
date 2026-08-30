// ExecuteCanvas's source liveData block previously had no arrival-total field
// at all — a source node showed only the inter-arrival countdown, unlike a
// sink node which prominently shows its served count. Confirms
// snap.eventCounts[<ARRIVE bEventId>] (the same per-node eventCounts lookup
// the sink branch already uses for its own count) now reaches the source node.
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
// ExecuteSourceNode intentionally left real — it's what this file verifies.

const model = {
  bEvents: [
    { id: "be1", name: "Hire Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" },
    { id: "be2", name: "Complete", scheduledTime: 9999, effect: "COMPLETE()" },
  ],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Queue A, Clerk)", condition: null, cSchedules: [{ eventId: "be2" }] }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk",    role: "server", count: "1" },
  ],
};

const makeSnap = (extra = {}) => ({
  clock: 10, served: 0, reneged: 0, balked: 0,
  entities: [], nextArrivals: {}, byType: {}, eventCounts: {},
  ...extra,
});

describe("ExecuteCanvas — source node arrival live data", () => {
  test("threads the ARRIVE b-event's eventCounts fire count into the source node's arrival total", () => {
    render(<ExecuteCanvas model={model} snap={makeSnap({ eventCounts: { be1: 52 } })} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("52")).toBeInTheDocument();
    expect(canvas.getByText("arrived")).toBeInTheDocument();
  });

  test("shows 0 arrived before any arrival has fired", () => {
    render(<ExecuteCanvas model={model} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("0")).toBeInTheDocument();
    expect(canvas.getByText("arrived")).toBeInTheDocument();
  });
});
