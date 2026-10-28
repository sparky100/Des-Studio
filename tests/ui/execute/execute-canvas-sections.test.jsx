// Run canvas — Detail | Sections view with live section cards
import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { ExecuteCanvas } from "../../../src/ui/execute/ExecuteCanvas.jsx";

const flowProps = { current: null };

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    ReactFlow: (props) => { flowProps.current = props; return <div data-testid="react-flow">{props.children}</div>; },
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }) => <div>{children}</div>,
    Handle: () => null,
    BaseEdge: () => null,
    getBezierPath: () => ["M0,0 L100,100"],
    useReactFlow: () => ({ fitView: vi.fn(), getNode: vi.fn(() => null), setCenter: vi.fn(), getViewport: vi.fn(() => ({ zoom: 1 })) }),
  };
});
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx", () => ({ ExecuteSourceNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx", () => ({ ExecuteQueueNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx", () => ({ ExecuteSinkNode: () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx", () => ({ AnimatedEdge: () => null }));

const model = {
  id: "m-sec",
  bEvents: [{ id: "be1", name: "Arrival", scheduledTime: 0, effect: "ARRIVE(Customer, Queue A)" }],
  cEvents: [{ id: "ce1", name: "Serve", priority: 1, effect: "ASSIGN(Queue A, Clerk)", condition: null }],
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer" },
    { id: "et2", name: "Clerk", role: "server", count: "1" },
  ],
  sections: [
    { id: "intake", name: "Intake", description: "Customers arrive and wait.", color: "#4A90D9", memberIds: ["be1", "q1"] },
    { id: "service", name: "Service", description: "", color: "#27AE60", memberIds: ["ce1"] },
  ],
};
const snap = {
  clock: 10, served: 0, reneged: 0, nextArrivals: {}, byType: {},
  entities: [
    { id: 1, type: "Clerk", role: "server", status: "idle", arrivalTime: 0 },
    { id: 2, type: "Customer", role: "customer", status: "waiting", arrivalTime: 5, queue: "Queue A" },
  ],
};
const KEY = "des.sections.view.m-sec";

describe("ExecuteCanvas — Sections view", () => {
  beforeEach(() => { localStorage.clear(); flowProps.current = null; });

  test("Detail shows the nodes; switching to Sections shows one live card per section and is remembered", () => {
    render(<ExecuteCanvas model={model} snap={snap} />);
    expect(flowProps.current.nodes.some(n => n.type === "sectionCard")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Sections" }));
    const cards = flowProps.current.nodes.filter(n => n.type === "sectionCard");
    expect(cards.map(c => c.data.label).sort()).toEqual(["Intake", "Service"]);
    expect(cards.find(c => c.data.sectionId === "intake").data.liveData).toMatchObject({ inNow: 1, entered: 1, left: 0 });
    expect(localStorage.getItem(KEY)).toBe("sections");
    expect(flowProps.current.edges.some(e => e.source === "submodel:intake" && e.target === "submodel:service")).toBe(true);
  });

  test("opens in the remembered view, and Show detail returns to that section's nodes", () => {
    localStorage.setItem(KEY, "sections");
    render(<ExecuteCanvas model={model} snap={snap} />);
    expect(flowProps.current.nodes.filter(n => n.type === "sectionCard")).toHaveLength(2);

    act(() => flowProps.current.nodes.find(n => n.data.sectionId === "service").data.onShowDetail());
    expect(flowProps.current.nodes.some(n => n.type === "sectionCard")).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("detail");
  });

  test("cards say the run has not started before the first snapshot", () => {
    localStorage.setItem(KEY, "sections");
    render(<ExecuteCanvas model={model} snap={null} />);
    expect(flowProps.current.nodes.find(n => n.type === "sectionCard").data.liveData).toBeNull();
  });
});
