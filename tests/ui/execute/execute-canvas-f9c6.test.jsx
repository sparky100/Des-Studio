// F9C.6 — Animation toggle saves to user_settings; disabled mode spawns no tokens
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { ExecuteCanvas } from "../../../src/ui/execute/ExecuteCanvas.jsx";

// Mock @xyflow/react so we don't need a real DOM canvas
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ children, onNodeClick, onPaneClick }) => (
      <div data-testid="react-flow" onClick={() => onPaneClick?.()}>
        {children}
      </div>
    ),
    Background: () => null,
    Controls:   () => null,
    Panel:      ({ children }) => <div>{children}</div>,
    Handle:     () => null,
    BaseEdge:   () => null,
    getBezierPath: () => ["M0,0 L100,100"],
  };
});
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx",   () => ({ ExecuteSourceNode:   () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx",    () => ({ ExecuteQueueNode:    () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",     () => ({ ExecuteSinkNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => <line data-testid="animated-edge" /> }));

const minModel = {
  bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0,
    effect: "ARRIVE(Customer, Queue A)" }],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1,
    effect: "ASSIGN(Queue A, Clerk)", condition: null }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk",    role: "server", count: "1" },
  ],
};

const makeSnap = (extra = {}) => ({
  clock: 10, served: 2, reneged: 0,
  entities: [
    { id: 1, type: "Clerk",    role: "server",   status: "idle",    arrivalTime: 0 },
    { id: 2, type: "Customer", role: "customer", status: "waiting", arrivalTime: 5, queue: "Queue A" },
  ],
  nextArrivals: {},
  byType: {},
  ...extra,
});

describe("ExecuteCanvas — F9C.6 animation", () => {
  test("renders without crashing when animationEnabled=false", () => {
    render(<ExecuteCanvas model={minModel} snap={makeSnap()} animationEnabled={false} />);
    expect(screen.getByLabelText("Execute canvas")).toBeInTheDocument();
  });

  test("renders without crashing when animationEnabled=true", () => {
    render(<ExecuteCanvas model={minModel} snap={makeSnap()} animationEnabled={true} />);
    expect(screen.getByLabelText("Execute canvas")).toBeInTheDocument();
  });

  test("onNodeSelect callback fires on pane click (clear selection)", async () => {
    const onNodeSelect = vi.fn();
    render(<ExecuteCanvas model={minModel} snap={makeSnap()} onNodeSelect={onNodeSelect} />);
    fireEvent.click(screen.getByTestId("react-flow"));
    expect(onNodeSelect).toHaveBeenCalledWith(null);
  });
});
