import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { LivePreviewPanel } from "../../../src/ui/visual-designer/LivePreviewPanel.jsx";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    ReactFlow: ({ children }) => <div data-testid="react-flow">{children}</div>,
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }) => <div>{children}</div>,
    Handle: () => null,
    BaseEdge: () => null,
    getBezierPath: () => ["M0,0 L100,100"],
    useReactFlow: () => ({ fitView: vi.fn(), getNode: vi.fn(() => null), setCenter: vi.fn(), getViewport: vi.fn(() => ({ zoom: 1 })) }),
  };
});
vi.mock("../../../src/ui/execute/ExecuteSourceNode.jsx",   () => ({ ExecuteSourceNode:   () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteQueueNode.jsx",    () => ({ ExecuteQueueNode:    () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteActivityNode.jsx", () => ({ ExecuteActivityNode: () => <div /> }));
vi.mock("../../../src/ui/execute/ExecuteSinkNode.jsx",     () => ({ ExecuteSinkNode:     () => <div /> }));
vi.mock("../../../src/ui/execute/AnimatedEdge.jsx",        () => ({ AnimatedEdge:        () => <div /> }));

const validModel = {
  id: 'm1',
  entityTypes: [
    { id: 'cust', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'srv', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: 'arr', name: 'Arrival', scheduledTime: '0', effect: ['ARRIVE(Customer)'], schedules: [{ eventId: 'arr', dist: 'Exponential', distParams: { mean: '2' } }] },
    { id: 'comp', name: 'Complete', scheduledTime: '9999', effect: ['COMPLETE()'], schedules: [] },
  ],
  cEvents: [{
    id: 'seize', name: 'Seize', condition: 'queue(Customer).length > 0 AND idle(Server).count > 0',
    effect: ['ASSIGN(Customer, Server)'],
    cSchedules: [{ eventId: 'comp', dist: 'Exponential', distParams: { mean: '1' }, useEntityCtx: true }],
  }],
  queues: [{ id: 'q', name: 'Customer', customerType: 'Customer', capacity: '', discipline: 'FIFO' }],
};

describe("LivePreviewPanel", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* noop */ }
  });

  test("starts collapsed and mounts no engine or canvas until toggled", () => {
    render(<LivePreviewPanel model={validModel} hasBlockingErrors={false} />);
    expect(screen.getByRole("button", { name: /expand live preview/i })).toBeInTheDocument();
    expect(screen.queryByTestId("react-flow")).not.toBeInTheDocument();
  });

  test("expanding with a valid model shows the preview canvas (no blocking-errors message)", async () => {
    const user = userEvent.setup();
    render(<LivePreviewPanel model={validModel} hasBlockingErrors={false} />);
    await user.click(screen.getByRole("button", { name: /expand live preview/i }));
    expect(screen.queryByText(/validation errors/i)).not.toBeInTheDocument();
    expect(await screen.findByTestId("react-flow")).toBeInTheDocument();
  });

  test("expanding with blocking validation errors shows guidance instead of running", async () => {
    const user = userEvent.setup();
    render(<LivePreviewPanel model={validModel} hasBlockingErrors={true} />);
    await user.click(screen.getByRole("button", { name: /expand live preview/i }));
    expect(screen.getByText(/validation errors/i)).toBeInTheDocument();
    expect(screen.queryByTestId("react-flow")).not.toBeInTheDocument();
  });

  test("toggle state persists to localStorage under the des.livePreview namespace", async () => {
    const user = userEvent.setup();
    render(<LivePreviewPanel model={validModel} hasBlockingErrors={false} />);
    await user.click(screen.getByRole("button", { name: /expand live preview/i }));
    expect(localStorage.getItem("des.livePreview.enabled")).toBe("1");
    await user.click(screen.getByRole("button", { name: /collapse live preview/i }));
    expect(localStorage.getItem("des.livePreview.enabled")).toBe("0");
  });
});
