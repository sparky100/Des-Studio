// F9C.8 + F9C.9 — BottomPanel: tabs, collapse, Stage KPIs
// S17 — Analysis tab, warm-up detection display, batch-means, distribution diagnostics
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import { BottomPanel } from "../../../src/ui/execute/BottomPanel.jsx";

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

const makeReplicationResult = (avgWait, avgSvc = 5, served = 100) => ({
  result: {
    summary: { avgWait, avgSvc, avgSojourn: avgWait + avgSvc, served, reneged: 0 },
    timeSeries: Array.from({ length: 20 }, (_, i) => ({
      t: i * 5,
      byType: { Customer: { waiting: avgWait + Math.sin(i) } },
    })),
  },
});

const warmupDetection = {
  truncationPoint: 35,
  explanation: "Welch's method detected a warm-up truncation at t=35.00. The smoothed ensemble average stabilised strongly after this point (relative change 45.0%).",
  series: Array.from({ length: 20 }, (_, i) => ({ t: i * 5, value: 10 - i * 0.4 })),
  confidence: "high",
};

describe("BottomPanel — F9C.8", () => {
  test("renders all five active tabs including Analysis", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByRole("tab", { name: /step log/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /entities/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /stage kpis/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /charts/i })).not.toBeDisabled();
    expect(screen.getByRole("tab", { name: /analysis/i })).toBeInTheDocument();
  });

  test("collapse toggle hides the panel body", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    // Log content visible initially
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /collapse panel/i }));
    // Log content hidden after collapse
    expect(screen.queryByText(/ARRIVE Customer/)).not.toBeInTheDocument();
  });

  test("expand toggle restores panel body", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: /collapse panel/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand panel/i }));
    expect(screen.getByText(/ARRIVE Customer/)).toBeInTheDocument();
  });
});

describe("BottomPanel — F9C.9 Stage KPIs", () => {
  test("Stage KPIs tab shows queue row and server row", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("tab", { name: /stage kpis/i }));
    expect(screen.getByText("Queue A")).toBeInTheDocument();
    expect(screen.getByText("Clerk")).toBeInTheDocument();
  });

  test("shows placeholder when snap is null", () => {
    render(<BottomPanel log={[]} snap={null} model={model} />);
    fireEvent.click(screen.getByRole("tab", { name: /stage kpis/i }));
    expect(screen.getByText(/run the simulation/i)).toBeInTheDocument();
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
});

describe("BottomPanel — S17 Analysis tab", () => {
  test("Analysis tab shows warm-up detection section when warmupDetection is provided", () => {
    render(
      <BottomPanel log={log} snap={snap} model={model}
        warmupDetection={warmupDetection} />
    );
    fireEvent.click(screen.getByRole("tab", { name: /analysis/i }));
    expect(screen.getByText(/WARM-UP DETECTION/i)).toBeInTheDocument();
    expect(screen.getByText(/Welch's method/i)).toBeInTheDocument();
    expect(screen.getByText(/t=35.00/)).toBeInTheDocument();
  });

  test("Analysis tab shows batch-means section with metric picker", () => {
    render(
      <BottomPanel log={log} snap={snap} model={model}
        replicationResults={[makeReplicationResult(8), makeReplicationResult(10), makeReplicationResult(12)]} />
    );
    fireEvent.click(screen.getByRole("tab", { name: /analysis/i }));
    expect(screen.getAllByText(/BATCH-MEANS CONFIDENCE INTERVAL/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("combobox", { name: /batch-means metric/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /compute/i })).toBeInTheDocument();
  });

  test("Analysis tab batch-means Compute button is enabled when replicationResults exist", () => {
    render(
      <BottomPanel log={log} snap={snap} model={model}
        replicationResults={[makeReplicationResult(8), makeReplicationResult(10)]} />
    );
    fireEvent.click(screen.getByRole("tab", { name: /analysis/i }));
    expect(screen.getByRole("button", { name: /compute/i })).not.toBeDisabled();
  });

  test("Analysis tab batch-means Compute button is disabled without replicationResults", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("tab", { name: /analysis/i }));
    expect(screen.getByRole("button", { name: /compute/i })).toBeDisabled();
  });

  test("Analysis tab shows distribution diagnostics when enough replications exist", () => {
    render(
      <BottomPanel log={log} snap={snap} model={model}
        replicationResults={[
          makeReplicationResult(8, 5, 100),
          makeReplicationResult(10, 6, 110),
          makeReplicationResult(12, 7, 120),
          makeReplicationResult(9, 5, 105),
          makeReplicationResult(11, 6, 115),
        ]} />
    );
    fireEvent.click(screen.getByRole("tab", { name: /analysis/i }));
    expect(screen.getByText(/DISTRIBUTION DIAGNOSTICS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/skewness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/kurtosis/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/p50/i)).toBeInTheDocument();
    expect(screen.getByText(/p90/i)).toBeInTheDocument();
  });

  test("Analysis tab shows placeholder when warmupDetection is null", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    fireEvent.click(screen.getByRole("tab", { name: /analysis/i }));
    expect(screen.getByText(/run a replication batch/i)).toBeInTheDocument();
  });
});

describe("BottomPanel — Results charts", () => {
  const chartResults = {
    timeSeries: [
      {
        t: 0,
        byQueue: { "Queue A": { waiting: 1 } },
        byType: { Customer: { waiting: 1 }, Clerk: { busy: 0 } },
      },
      {
        t: 5,
        byQueue: { "Queue A": { waiting: 3 } },
        byType: { Customer: { waiting: 3 }, Clerk: { busy: 1 } },
      },
    ],
    waitDist: {
      "Queue A": { n: 3, mean: 4, p50: 4, p90: 8, p95: 8, p99: 8, values: [1, 4, 8] },
    },
  };

  test("Charts tab frames charts as modelling questions", () => {
    render(<BottomPanel log={log} snap={snap} model={model} results={chartResults} />);
    fireEvent.click(screen.getByRole("tab", { name: /charts/i }));

    expect(screen.getByText(/Where are queues forming/i)).toBeInTheDocument();
    expect(screen.getByText(/Are resources under- or over-utilised/i)).toBeInTheDocument();
    expect(screen.getByText(/How variable is customer waiting time/i)).toBeInTheDocument();
  });

  test("Charts tab shows data provenance labels", () => {
    render(<BottomPanel log={log} snap={snap} model={model} results={chartResults} />);
    fireEvent.click(screen.getByRole("tab", { name: /charts/i }));

    expect(screen.getByText(/Data: Queue-specific runtime counts/i)).toBeInTheDocument();
    expect(screen.getByText(/Data: Busy Clerk resources divided by capacity 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Data: 3 completed waits from engine waitDist/i)).toBeInTheDocument();
  });
});
