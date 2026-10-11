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

// The trend used to be a sparkline of the last 20 screen updates scaled to its
// own recent maximum: a steady level always drew as a "full" line at the top.
// Now: a fill gauge (level ÷ capacity) and a trend over the last 10% of the run
// on a 0–capacity scale, with its span and min–max written underneath.
describe("ExecuteCanvas — container fill gauge and level trend", () => {
  const oilish = { ...containerModel, timeUnit: "days", experimentDefaults: { maxSimTime: 300 }, containerTypes: [{ id: "ct_us_products", capacity: "250", initialLevel: "44" }] };
  const snapAt = (clock, level) => makeSnap({ clock, containers: { ct_us_products: { level, capacity: 250 } } });
  const trendLineY = container => {
    const pts = container.querySelector('[data-testid="container-level-trend"] polyline').getAttribute("points").split(" ");
    return pts.map(p => Number(p.split(",")[1]));
  };

  test("the gauge shows level ÷ capacity", () => {
    render(<ExecuteCanvas model={oilish} snap={snapAt(14, 75)} />);
    const gauge = screen.getByTestId("container-fill-gauge");
    expect(gauge).toHaveAttribute("aria-valuenow", "75");
    expect(gauge).toHaveAttribute("aria-valuemax", "250");
    expect(parseFloat(gauge.firstChild.style.width)).toBeCloseTo(30, 5);
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  test("a steady level draws at its share of capacity, not as a full line", () => {
    const { container, rerender } = render(<ExecuteCanvas model={oilish} snap={snapAt(10, 75)} />);
    rerender(<ExecuteCanvas model={oilish} snap={snapAt(12, 75)} />);
    rerender(<ExecuteCanvas model={oilish} snap={snapAt(14, 75)} />);
    // 75/250 = 30% full → 70% of the way down a 22px-high trend (y ≈ 15), not at the top.
    for (const y of trendLineY(container)) expect(y).toBeCloseTo(21 - 0.3 * 20, 1);
    expect(screen.getByText("last 4 days · 75")).toBeInTheDocument();
  });

  test("the trend keeps only the last 10% of the run and labels its span and range", () => {
    const { rerender } = render(<ExecuteCanvas model={oilish} snap={snapAt(0, 44)} />);
    rerender(<ExecuteCanvas model={oilish} snap={snapAt(20, 120)} />);
    rerender(<ExecuteCanvas model={oilish} snap={snapAt(40, 90)} />);
    rerender(<ExecuteCanvas model={oilish} snap={snapAt(45, 100)} />);
    // Window = 30 days (10% of 300): at day 45 the day-0 sample (older than
    // day 15) is dropped; days 20, 40 and 45 remain.
    expect(screen.getByText("last 25 days · 90–120")).toBeInTheDocument();
  });

  test("an unbounded container has no gauge and its trend scales to the highest level seen", () => {
    const unbounded = { ...oilish, containerTypes: [{ id: "ct_us_products", initialLevel: "0" }] };
    const snap = (clock, level) => makeSnap({ clock, containers: { ct_us_products: { level, capacity: null } } });
    const { container, rerender } = render(<ExecuteCanvas model={unbounded} snap={snap(1, 10)} />);
    rerender(<ExecuteCanvas model={unbounded} snap={snap(2, 40)} />);
    expect(screen.queryByTestId("container-fill-gauge")).toBeNull();
    const ys = trendLineY(container);
    expect(ys.at(-1)).toBeCloseTo(1, 1); // highest level at the top
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
