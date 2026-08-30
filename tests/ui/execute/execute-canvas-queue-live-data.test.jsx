// ExecuteCanvas's queue liveData block previously had no customerType field —
// ExecuteQueueNode's depth caption always read the generic "N waiting", even
// though a queue's own model config already names who's allowed in it
// (Queue.customerType). Confirms qDef.customerType (already resolved in the
// queue branch for capacity/discipline) now reaches the queue node too.
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
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",     () => ({ ExecuteSinkNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => null }));
// ExecuteQueueNode intentionally left real — it's what this file verifies.

const model = {
  bEvents: [
    { id: "be1", name: "Hire Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Hire Queue)" },
    { id: "be2", name: "Complete", scheduledTime: 9999, effect: "COMPLETE()" },
  ],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Hire Queue, Clerk)", condition: null, cSchedules: [{ eventId: "be2" }] }],
  queues: [{ id: "q1", name: "Hire Queue", customerType: "Customer" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk",    role: "server", count: "1" },
  ],
};

const makeSnap = (extra = {}) => ({
  clock: 10, served: 0, reneged: 0, balked: 0,
  entities: [{ id: 1, type: "Customer", role: "customer", status: "waiting", queue: "Hire Queue" }],
  nextArrivals: {}, byType: {}, eventCounts: {},
  ...extra,
});

describe("ExecuteCanvas — queue node customerType live data", () => {
  test("threads the queue's configured customerType into the depth caption", () => {
    render(<ExecuteCanvas model={model} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("Customers waiting")).toBeInTheDocument();
  });

  test("falls back to the generic caption when the queue has no configured customerType", () => {
    const noTypeModel = { ...model, queues: [{ id: "q1", name: "Hire Queue" }] };
    render(<ExecuteCanvas model={noTypeModel} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("waiting")).toBeInTheDocument();
  });
});
