// F9C.8 + F9C.9 — BottomPanel: tabs, collapse, live metrics
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { BottomPanel } from "../../../src/ui/execute/BottomPanel.jsx";

beforeEach(() => {
  localStorage.clear();
});

vi.mock("../../../src/ui/shared/components.jsx", () => ({
  Tag:      ({ label }) => <span>{label}</span>,
  PhaseTag: ({ phase }) => <span>{phase}</span>,
  Btn:      ({ children, onClick, disabled, small, variant }) =>
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-small={small}>{children}</button>,
}));

const log = [
  { phase: "B", time: 1, message: "ARRIVE Customer #1 to Queue A" },
  { phase: "C", time: 2, message: "ASSIGN Customer #1 to Clerk" },
];

const detailedLog = [
  {
    seq: 1,
    phase: "C",
    time: 2,
    message: 'C: "Start Service"  ·  #2 (Customer) → serving by #1 (Clerk)',
    cEval: { eventName: "Start Service", conditionTrue: true, pass: 1, priority: 1 },
    event: { fired: true, entityIds: [2], newEvents: [{ name: "Service Complete", at: 5 }] },
    arbitration: { type: "server", serverType: "Clerk", discipline: "FIFO", winner: { entityId: 2, serverId: 1 }, losers: [] },
  },
];

const snap = {
  clock: 5, served: 1, reneged: 0,
  entities: [
    { id: 1, type: "Clerk",    role: "server",   status: "idle",    arrivalTime: 0 },
    { id: 2, type: "Customer", role: "customer", status: "waiting", queue: "Queue A", arrivalTime: 1 },
  ],
};

const model = {
  queues: [{ id: "q1", name: "Queue A" }],
  entityTypes: [
    { id: "e1", name: "Customer", role: "customer" },
    { id: "e2", name: "Clerk",    role: "server", count: "1" },
  ],
};

describe("BottomPanel — F9C.8", () => {
  test("renders live execution tabs including Charts tab", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByRole("tab", { name: /step log/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /entity details/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /charts/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /live metrics/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /analysis/i })).not.toBeInTheDocument();
  });

  test("collapse toggle hides the panel body", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    // Log content visible initially
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /collapse details panel/i }));
    // Log content hidden after collapse
    expect(screen.queryByText(/ARRIVE Customer/)).not.toBeInTheDocument();
  });

  test("expand toggle restores panel body", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: /collapse details panel/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand details panel/i }));
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
  });

  test("keeps a stable body height so tab content scrolls inside the panel", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    const body = screen.getByLabelText(/bottom panel content/i);
    expect(body).toHaveStyle({ height: "320px", minHeight: "320px", overflowY: "auto" });

    fireEvent.click(screen.getByRole("tab", { name: /entity details/i }));
    expect(screen.getByLabelText(/bottom panel content/i)).toHaveStyle({ height: "320px" });
  });

  test("offers maximize and resize affordances for the live inspector", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByRole("button", { name: /expand panel/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize bottom panel/i })).toBeInTheDocument();
  });

  test("shows an Open Results action when run results are available", () => {
    const onOpenResults = vi.fn();
    render(<BottomPanel log={log} snap={snap} model={model} hasResults onOpenResults={onOpenResults} />);
    fireEvent.click(screen.getByRole("button", { name: /open results/i }));
    expect(onOpenResults).toHaveBeenCalledOnce();
  });
});

describe("BottomPanel — F9C.9 live metrics", () => {
  test("Live Metrics tab shows queue row and server row", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("tab", { name: /live metrics/i }));
    expect(screen.getByText("Queue A")).toBeInTheDocument();
    expect(screen.getByText("Clerk")).toBeInTheDocument();
  });

  test("shows placeholder when snap is null", () => {
    render(<BottomPanel log={[]} snap={null} model={model} />);
    fireEvent.click(screen.getByRole("tab", { name: /live metrics/i }));
    expect(screen.getByText(/run the simulation to see live metrics/i)).toBeInTheDocument();
  });
});

describe("BottomPanel — F9C.11 node-filtered log", () => {
  test("shows only matching log entries when selectedNodeLabel is set", () => {
    render(
      <BottomPanel log={log} snap={snap} model={model}
        selectedNodeLabel="Queue A" onClearFilter={() => {}} />
    );
    // "ARRIVE Customer #1 to Queue A" matches; "ASSIGN Customer #1 to Clerk" does not
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    expect(screen.queryByText(/ASSIGN Customer/)).not.toBeInTheDocument();
  });

  test("Show all button calls onClearFilter", () => {
    const onClear = vi.fn();
    render(
      <BottomPanel log={log} snap={snap} model={model}
        selectedNodeLabel="Queue A" onClearFilter={onClear} />
    );
    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  test("all log entries shown when no filter", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    expect(screen.getByText(/ASSIGN Customer/)).toBeInTheDocument();
  });

  test("expanded debug detail renders structured trace and supports entity selection", () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={detailedLog} snap={snap} model={model} onEntitySelect={onEntitySelect} />);

    fireEvent.click(screen.getByTitle(/toggle debug detail/i));
    expect(screen.getByText(/C-Eval/i)).toBeInTheDocument();
    expect(screen.getByText(/winner: #2 → server #1/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("#2"));
    expect(onEntitySelect).toHaveBeenCalledWith(2);
  });
});

describe("BottomPanel — inspector", () => {
  test("entities tab shows the selected entity details in split view", () => {
    render(<BottomPanel log={log} snap={snap} model={model} selectedEntityId={2} />);

    fireEvent.click(screen.getByRole("tab", { name: /entity details/i }));
    const entityIds = screen.getAllByText("#2");
    expect(entityIds.length).toBeGreaterThanOrEqual(1);
    const customerTypes = screen.getAllByText("Customer");
    expect(customerTypes.length).toBeGreaterThanOrEqual(1);
    const queueLabels = screen.getAllByText("Queue A");
    expect(queueLabels.length).toBeGreaterThanOrEqual(1);
  });
});

const mockModel = {
  entityTypes: [
    { id: "et1", name: "Customer", role: "customer", attrDefs: [] },
    { id: "et2", name: "Server", role: "server", count: "1", attrDefs: [] },
  ],
  queues: [{ id: "q1", name: "Queue", discipline: "FIFO" }],
  bEvents: [{ id: "b1", name: "Arrival" }],
  cEvents: [{ id: "c1", name: "Assign", priority: 1 }],
};

const mockSnap = {
  clock: 10.5,
  served: 3,
  reneged: 0,
  entities: [
    { id: 1, type: "Customer", role: "customer", status: "waiting", queue: "Queue", arrivalTime: 2, attrs: {}, stages: [] },
    { id: 2, type: "Customer", role: "customer", status: "serving", queue: "Queue", arrivalTime: 1, attrs: {}, stages: [], serverId: 10 },
    { id: 10, type: "Server", role: "server", status: "busy", attrs: {} },
  ],
};

const mockLog = [
  { phase: "INIT", time: 0, seq: 1, message: "Engine initialised" },
  { phase: "A", time: 0, seq: 2, message: "Clock → t=0.000", clock: { from: 0, to: 0, dueEvents: [] } },
  { phase: "B", time: 0, seq: 3, message: `B: "Arrival"  ·  #1 (Customer) arrived → waiting [queue: Queue, depth: 1]`, event: { type: "B", id: "b1", name: "Arrival", fired: true, entityIds: [1], newEvents: [] } },
  { phase: "C", time: 0, seq: 4, message: `C: "Assign"  ·  #1 (Customer) → serving by #10 (Server)`, cEval: { eventId: "c1", eventName: "Assign", priority: 1, pass: 1, conditionTrue: true }, event: { type: "C", id: "c1", name: "Assign", fired: true, entityIds: [1, 10], newEvents: [] }, arbitration: { type: "server", serverType: "Server", discipline: "FIFO", candidates: [{ entityId: 1, type: "Customer", key: "arrivalTime", value: 0 }], idleServers: [{ serverId: 10, type: "Server" }], winner: { entityId: 1, serverId: 10 } } },
];

describe("BottomPanel — LogTab", () => {
  test("renders log entries with phase tags", () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} />);
    expect(screen.getByText(/Engine initialised/i)).toBeInTheDocument();
    expect(screen.getByText(/Clock/i)).toBeInTheDocument();
  });

  test("expand button shows debug detail for entries with cEval", () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} />);
    const expandButtons = screen.getAllByText("▶");
    expect(expandButtons.length).toBeGreaterThan(0);
    fireEvent.click(expandButtons[0]);
    expect(screen.getByText(/C-Eval/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Assign/i).length).toBeGreaterThan(0);
  });

  test("entity ID links in log detail call onEntitySelect", () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} onEntitySelect={onEntitySelect} />);
    const expandButtons = screen.getAllByText("▶");
    fireEvent.click(expandButtons[0]);
    const entityLink = screen.getByText("#1");
    fireEvent.click(entityLink);
    expect(onEntitySelect).toHaveBeenCalledWith(1);
  });

  test("node name in log message is clickable and calls onNodeSelect", () => {
    const onNodeSelect = vi.fn();
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} onNodeSelect={onNodeSelect} />);
    const nodeLink = screen.getByText("Arrival");
    fireEvent.click(nodeLink);
    expect(onNodeSelect).toHaveBeenCalledWith("Arrival");
  });

  test("node filter banner shows when selectedNodeLabel is set", () => {
    render(<BottomPanel log={mockLog} snap={mockSnap} model={mockModel} selectedNodeLabel="Queue" />);
    expect(screen.getByText(/Filter: Queue/i)).toBeInTheDocument();
    expect(screen.getByText("Show all")).toBeInTheDocument();
  });
});

describe("BottomPanel — EntitiesTab", () => {
  test("renders active entities with status tags", () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    expect(screen.getByText(/2 active entities/i)).toBeInTheDocument();
    expect(screen.getByText("waiting")).toBeInTheDocument();
    expect(screen.getAllByText("In Service").length).toBeGreaterThanOrEqual(1);
  });

  test("clicking entity row calls onEntitySelect with entity ID", () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    const rows = screen.getAllByText(/#1/i);
    fireEvent.click(rows[0]);
    expect(onEntitySelect).toHaveBeenCalledWith(1);
  });

  test("clicking same entity again deselects it", () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    const rows = screen.getAllByText(/#1/i);
    fireEvent.click(rows[0]);
    expect(onEntitySelect).toHaveBeenCalledWith(null);
  });
});

describe("BottomPanel — EntityInspector", () => {
  test("inspector pane shows entity details when entity is selected", () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    const entityIds = screen.getAllByText("#1");
    expect(entityIds.length).toBeGreaterThanOrEqual(1);
    const customerTypes = screen.getAllByText("Customer");
    expect(customerTypes.length).toBeGreaterThanOrEqual(1);
    const waitingLabels = screen.getAllByText("waiting");
    expect(waitingLabels.length).toBeGreaterThanOrEqual(1);
  });

  test("inspector shows waiting age", () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    const waitingLabels = screen.getAllByText(/Waiting/i);
    expect(waitingLabels.length).toBeGreaterThanOrEqual(1);
  });

  test("inspector close button calls onEntitySelect with null", () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={1} onEntitySelect={onEntitySelect} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    const closeBtn = screen.getByText("Clear");
    fireEvent.click(closeBtn);
    expect(onEntitySelect).toHaveBeenCalledWith(null);
  });

  test("inspector shows in-service entity with server ID", () => {
    render(<BottomPanel log={[]} snap={mockSnap} model={mockModel} selectedEntityId={2} />);
    fireEvent.click(screen.getByRole("tab", { name: /Entity Details/i }));
    const entityIds = screen.getAllByText("#2");
    expect(entityIds.length).toBeGreaterThanOrEqual(1);
    const inServiceLabels = screen.getAllByText("In Service");
    expect(inServiceLabels.length).toBeGreaterThanOrEqual(1);
    const serverIds = screen.getAllByText("#10");
    expect(serverIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe("BottomPanel — G15 Charts tab", () => {
  const timeSeriesData = [
    { t: 0, byQueue: { "Queue A": { waiting: 0 } } },
    { t: 1, byQueue: { "Queue A": { waiting: 2 } } },
    { t: 2, byQueue: { "Queue A": { waiting: 1 } } },
    { t: 3, byQueue: { "Queue A": { waiting: 3 } } },
  ];

  test("Charts tab shows queue-depth time-plot when time-series data is available", () => {
    render(<BottomPanel log={log} snap={snap} model={model} timeSeries={timeSeriesData} />);
    fireEvent.click(screen.getByRole("tab", { name: /charts/i }));
    expect(screen.getByText(/Queue A/)).toBeInTheDocument();
    expect(screen.getByText(/Simulation time/)).toBeInTheDocument();
  });

  test("Charts tab shows empty state when no time-series data", () => {
    render(<BottomPanel log={log} snap={snap} model={model} timeSeries={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /charts/i }));
    expect(screen.getByText(/wait time histograms will appear here/i)).toBeInTheDocument();
  });

  test("Charts tab shows empty state when time-series has fewer than 2 points", () => {
    render(<BottomPanel log={log} snap={snap} model={model} timeSeries={[{ t: 0, byQueue: {} }]} />);
    fireEvent.click(screen.getByRole("tab", { name: /charts/i }));
    expect(screen.getByText(/no time-series data/i)).toBeInTheDocument();
  });
});
