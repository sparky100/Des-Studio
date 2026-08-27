// Run canvas should open at the Draw viewport (des.vp.<modelId>) instead of
// always fitView-ing the whole model into a shrunken frame — same coordinate
// space, since computeExecuteLayout preserves saved Draw node positions.
import { render, screen } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import { ExecuteCanvas, computeCanvasFillHeight } from "../../../src/ui/execute/ExecuteCanvas.jsx";

// Mock @xyflow/react, surfacing the props under test as data-* attributes.
vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    ReactFlow: ({ children, fitView, defaultViewport, minZoom }) => (
      <div
        data-testid="react-flow"
        data-fit-view={String(!!fitView)}
        data-default-viewport={defaultViewport ? JSON.stringify(defaultViewport) : ""}
        data-min-zoom={minZoom}
      >
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
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => <line data-testid="animated-edge" /> }));

const model = {
  id: "m1",
  bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" }],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Queue A, Clerk)", condition: null }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk",    role: "server", count: "1" },
  ],
};

describe("ExecuteCanvas — viewport parity with Draw", () => {
  test("uses the stored Draw viewport and skips fitView when one exists", () => {
    localStorage.setItem("des.vp.m1", JSON.stringify({ x: 12, y: -8, zoom: 0.9 }));
    render(<ExecuteCanvas model={model} snap={null} />);
    const flow = screen.getByTestId("react-flow");
    expect(flow).toHaveAttribute("data-fit-view", "false");
    expect(flow).toHaveAttribute("data-default-viewport", JSON.stringify({ x: 12, y: -8, zoom: 0.9 }));
  });

  test("falls back to fitView when no stored viewport exists (first visit / another device)", () => {
    render(<ExecuteCanvas model={model} snap={null} />);
    const flow = screen.getByTestId("react-flow");
    expect(flow).toHaveAttribute("data-fit-view", "true");
    expect(flow).toHaveAttribute("data-default-viewport", "");
  });

  test("matches Draw's minZoom so the canvas can zoom out as far as Draw can", () => {
    render(<ExecuteCanvas model={model} snap={null} />);
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-min-zoom", "0.1");
  });
});

describe("computeCanvasFillHeight", () => {
  test("fills the remaining viewport below the canvas", () => {
    expect(computeCanvasFillHeight(200, 900)).toBe(900 - 200 - 64);
  });

  test("floors at 280 on a small viewport", () => {
    expect(computeCanvasFillHeight(700, 720)).toBe(280);
  });

  test("returns null for non-finite input", () => {
    expect(computeCanvasFillHeight(NaN, 900)).toBeNull();
    expect(computeCanvasFillHeight(200, undefined)).toBeNull();
  });

  test("honours a custom reserved-bottom value", () => {
    expect(computeCanvasFillHeight(100, 800, 100)).toBe(800 - 100 - 100);
  });
});
