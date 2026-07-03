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
    // Panel starts collapsed — expand it first
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    // Now collapse it
    fireEvent.click(screen.getByRole("button", { name: /collapse details/i }));
    expect(screen.queryByText(/ARRIVE Customer/)).not.toBeInTheDocument();
  });

  test("expand toggle restores panel body", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    // Panel starts collapsed — expand it
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
  });

  test("keeps a stable body height so tab content scrolls inside the panel", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    // Expand the panel first (starts collapsed)
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    const body = screen.getByLabelText(/bottom panel content/i);
    expect(body).toHaveStyle({ height: "320px", minHeight: "320px", overflowY: "auto" });

    fireEvent.click(screen.getByRole("tab", { name: /entity details/i }));
    expect(screen.getByLabelText(/bottom panel content/i)).toHaveStyle({ height: "320px" });
  });

  test("offers resize affordance for the live inspector", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByRole("separator", { name: /resize bottom panel/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    expect(screen.queryByText(/ASSIGN Customer/)).not.toBeInTheDocument();
  });

  test("Show all button calls onClearFilter", () => {
    const onClear = vi.fn();
    render(
      <BottomPanel log={log} snap={snap} model={model}
        selectedNodeLabel="Queue A" onClearFilter={onClear} />
    );
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    fireEvent.click(screen.getByRole("button", { name: /show all/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  test("all log entries shown when no filter", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    expect(screen.getByText(/ASSIGN Customer/)).toBeInTheDocument();
  });

  test("expanded debug detail renders structured trace and supports entity selection", () => {
    const onEntitySelect = vi.fn();
    render(<BottomPanel log={detailedLog} snap={snap} model={model} onEntitySelect={onEntitySelect} />);

    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
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

  test("shows every co-seized server for an entity mid-COSEIZE, not just the primary claim", () => {
    const coseizeSnap = {
      clock: 5, served: 0, reneged: 0,
      entities: [
        { id: 1, type: "Surgeon",     role: "server",   status: "busy", currentCustId: 3 },
        { id: 4, type: "Anesthetist", role: "server",   status: "busy", currentCustId: 3 },
        { id: 3, type: "Patient",     role: "customer", status: "serving", serverId: 1, arrivalTime: 0 },
      ],
    };
    const coseizeModel = {
      queues: [],
      entityTypes: [
        { id: "e1", name: "Patient",      role: "customer" },
        { id: "e2", name: "Surgeon",      role: "server", count: "1" },
        { id: "e3", name: "Anesthetist",  role: "server", count: "1" },
      ],
    };
    render(<BottomPanel log={[]} snap={coseizeSnap} model={coseizeModel} selectedEntityId={3} />);
    fireEvent.click(screen.getByRole("tab", { name: /entity details/i }));

    expect(screen.getByText("Servers")).toBeInTheDocument();
    expect(screen.getByText("#1 (Surgeon), #4 (Anesthetist)")).toBeInTheDocument();
  });

  test("Service Stages history lists all co-seized server types for a completed COSEIZE stage", () => {
    const stageSnap = {
      clock: 10, served: 0, reneged: 0,
      entities: [
        {
          id: 3, type: "Patient", role: "customer", status: "waiting", queue: "WardQueue", arrivalTime: 0,
          stages: [{
            serverType: "Surgeon", serverTypes: ["Surgeon", "Anesthetist"],
            queueName: "SurgeryQueue", waitStartedAt: 0, serviceStartedAt: 1, serviceEndedAt: 3,
            stageWait: 1, stageService: 2,
          }],
        },
      ],
    };
    render(<BottomPanel log={[]} snap={stageSnap} model={model} selectedEntityId={3} />);
    fireEvent.click(screen.getByRole("tab", { name: /entity details/i }));

    expect(screen.getByText("Surgeon, Anesthetist")).toBeInTheDocument();
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
