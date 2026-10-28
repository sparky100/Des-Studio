// The Run inspector docks beside the canvas, inside the canvas card, the same
// way the Draw inspector does — it no longer floats over the page header.
import { render, screen } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import { ExecuteCanvas } from "../../../src/ui/execute/ExecuteCanvas.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    ReactFlow: ({ children }) => <div data-testid="react-flow">{children}</div>,
    Background: () => null,
    Controls:   () => null,
    Panel:      ({ children }) => <div>{children}</div>,
    Handle:     () => null,
    BaseEdge:   () => null,
    getBezierPath: () => ["M0,0 L100,100"],
    useReactFlow: () => ({ fitView: vi.fn(), getNode: vi.fn(() => null), setCenter: vi.fn(), getViewport: vi.fn(() => ({ zoom: 1 })) }),
  };
});
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx",   () => ({ ExecuteSourceNode:   () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx",    () => ({ ExecuteQueueNode:    () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",     () => ({ ExecuteSinkNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => null }));

const model = {
  bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" }],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Queue A, Clerk)", condition: null }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk", role: "server", count: "1" },
  ],
};

describe("ExecuteCanvas — docked Run inspector", () => {
  test("renders the inspector as a sibling of the canvas inside the canvas card", () => {
    render(
      <ExecuteCanvas
        model={model}
        snap={null}
        selectedNodeDetail={{ nodeType: "activityNode", label: "Serve", refId: "ce1" }}
      />
    );
    const canvas = screen.getByLabelText("Execute canvas");
    const resize = screen.getByRole("separator", { name: "Resize inspector" });
    expect(canvas.parentElement.contains(resize)).toBe(true);
    expect(canvas.contains(resize)).toBe(false);
    expect(screen.getByText(/No live data yet/)).toBeInTheDocument();
  });

  test("renders no inspector column content when nothing is selected", () => {
    render(<ExecuteCanvas model={model} snap={null} selectedNodeDetail={null} />);
    expect(screen.queryByRole("separator", { name: "Resize inspector" })).toBeNull();
  });
});
