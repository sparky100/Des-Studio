// Container nodes on the Run canvas previously showed only their static
// mount-time capacity label forever ("does nothing but show the capacity" —
// FLOW_NODE_TYPE had no `container` entry and the live-data-building loop had
// no `container` branch, so `liveData` stayed null and the generic LiveNode
// fallback rendered `data.sublabel` instead). A dedicated ExecuteContainerNode
// (mirroring ExecuteQueueNode's badge + sparkline pattern) now renders live
// level/capacity directly on the canvas node, and the separate standalone
// ContainerGaugeStrip panel that used to duplicate this above the canvas has
// been removed. This file uses its own ReactFlow mock (unlike
// execute-canvas-f9c6.test.jsx's, which only renders children) that actually
// maps `nodes`/`nodeTypes` through, so real node content renders.
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

const containerModel = {
  bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" }],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Queue A, Clerk)", condition: null }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk",    role: "server", count: "1" },
  ],
  containerTypes: [{ id: "Bikes", capacity: "20", initialLevel: "20" }],
};

const makeSnap = (extra = {}) => ({
  clock: 10, served: 2, reneged: 0,
  entities: [],
  nextArrivals: {},
  byType: {},
  ...extra,
});

describe("ExecuteCanvas — container node live level", () => {
  test("shows the live level/capacity from snap.containers directly on the canvas node", () => {
    render(<ExecuteCanvas model={containerModel} snap={makeSnap({ containers: { Bikes: { level: 5, capacity: 20 } } })} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("5/20")).toBeInTheDocument();
    expect(canvas.getByText("capacity")).toBeInTheDocument();
    expect(canvas.getByText("container")).toBeInTheDocument();
  });

  test("falls back to the container type's initialLevel before snap.containers has an entry", () => {
    render(<ExecuteCanvas model={containerModel} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("20/20")).toBeInTheDocument();
  });

  test("renders an unbounded container (no capacity) with just its level, no slash", () => {
    const unboundedModel = { ...containerModel, containerTypes: [{ id: "Bikes", initialLevel: "7" }] };
    render(<ExecuteCanvas model={unboundedModel} snap={makeSnap()} />);
    const canvas = within(screen.getByTestId("react-flow"));
    expect(canvas.getByText("7")).toBeInTheDocument();
    expect(canvas.getByText("level")).toBeInTheDocument();
  });

  test("no separate ContainerGaugeStrip panel is rendered above the canvas anymore", () => {
    render(<ExecuteCanvas model={containerModel} snap={makeSnap({ containers: { Bikes: { level: 5, capacity: 20 } } })} />);
    // Previously "5/20" appeared twice — once in the canvas node, once in the
    // standalone strip above it. Now it must appear exactly once.
    expect(screen.getAllByText("5/20")).toHaveLength(1);
  });

  test("tracks level history into a sparkline as the run advances, like ExecuteQueueNode does for depth", () => {
    const { container, rerender } = render(
      <ExecuteCanvas model={containerModel} snap={makeSnap({ clock: 1, containers: { Bikes: { level: 5, capacity: 20 } } })} />
    );
    // A single data point isn't enough to draw a line — no <svg> yet.
    expect(container.querySelector("svg")).toBeNull();
    rerender(
      <ExecuteCanvas model={containerModel} snap={makeSnap({ clock: 2, containers: { Bikes: { level: 3, capacity: 20 } } })} />
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("ExecuteCanvas — balked KPI slot", () => {
  test("a 'balked' KPI slot counts balked entities, matching the served/reneged slots' own precedence pattern", () => {
    const balkedEntities = [
      { id: 1, role: "customer", type: "Customer", status: "balked" },
      { id: 2, role: "customer", type: "Customer", status: "balked" },
    ];
    render(<ExecuteCanvas model={containerModel} snap={makeSnap({ entities: balkedEntities, balked: 2 })} kpiSlots={["balked"]} />);
    expect(screen.getByText("BALKED TOTAL")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
