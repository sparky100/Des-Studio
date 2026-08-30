// ExecuteCanvas's resource liveData block — confirms deriveTypeStats (shared
// with activity-node stats, see activityLiveData.js) correctly powers the
// dedicated Resource canvas node with overall per-resource-type capacity/
// busy/idle/utilisation, computed once per resource type rather than
// recomputed (and repeated) on every activity card that references it.
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
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",     () => ({ ExecuteSinkNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => null }));
// ExecuteResourceNode intentionally left real — it's what this file verifies.

const model = {
  bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" }],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Queue A, Staff)", condition: null }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Staff",    role: "server", count: "3" },
  ],
};

const makeSnap = (extra = {}) => ({
  clock: 10, served: 0, reneged: 0, balked: 0,
  entities: [], nextArrivals: {}, byType: {}, eventCounts: {},
  ...extra,
});

describe("ExecuteCanvas — resource node live data", () => {
  test("shows overall capacity/busy/idle/utilisation for the resource type, across all activities that use it", () => {
    render(<ExecuteCanvas model={model} snap={makeSnap({
      entities: [
        { id: 1, type: "Staff", role: "server", status: "busy" },
        { id: 2, type: "Staff", role: "server", status: "idle" },
        { id: 3, type: "Staff", role: "server", status: "idle" },
      ],
    })} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("Staff")).toBeInTheDocument();
    expect(canvas.getByText("1/3")).toBeInTheDocument();
    expect(canvas.getByText("2 idle")).toBeInTheDocument();
    expect(canvas.getByText("33% utilisation")).toBeInTheDocument();
  });
});
