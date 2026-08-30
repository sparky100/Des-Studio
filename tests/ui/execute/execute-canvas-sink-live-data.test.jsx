// ExecuteCanvas's sink liveData block previously hardcoded `reneged: 0`
// (dead code — the badge could never render, see ExecuteSinkNode.jsx) and
// had no `balked` field at all. Confirms the real data source (snap.reneged/
// snap.balked, the run's global running totals) now reaches the sink node.
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
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx",   () => ({ ExecuteSourceNode:   () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx",    () => ({ ExecuteQueueNode:    () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => null }));
// ExecuteSinkNode intentionally left real — it's what this file verifies.

const model = {
  bEvents: [
    { id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" },
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
  clock: 10, served: 5, reneged: 0, balked: 0,
  entities: [], nextArrivals: {}, byType: {}, eventCounts: {},
  ...extra,
});

describe("ExecuteCanvas — sink node reneged/balked live data", () => {
  test("threads snap.reneged and snap.balked into the sink node's badges", () => {
    render(<ExecuteCanvas model={model} snap={makeSnap({ reneged: 4, balked: 7 })} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("4 reneged")).toBeInTheDocument();
    expect(canvas.getByText("7 balked")).toBeInTheDocument();
  });

  test("shows neither badge when the run has had no reneging or balking", () => {
    render(<ExecuteCanvas model={model} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.queryByText(/reneged/)).not.toBeInTheDocument();
    expect(canvas.queryByText(/balked/)).not.toBeInTheDocument();
  });
});
