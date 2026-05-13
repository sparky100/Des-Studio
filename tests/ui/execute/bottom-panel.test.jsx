// F9C.8 + F9C.9 — BottomPanel: tabs, collapse, live metrics
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
  test("renders live execution tabs and leaves statistical analysis to Analysis", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByRole("tab", { name: /step log/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /entities/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /live metrics/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /charts/i })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("tab", { name: /entities/i }));
    expect(screen.getByLabelText(/bottom panel content/i)).toHaveStyle({ height: "320px" });
  });

  test("offers maximize and resize affordances for the live inspector", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByRole("button", { name: /expand panel/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize bottom panel/i })).toBeInTheDocument();
  });

  test("shows an Open Analysis action when run results are available", () => {
    const onOpenResults = vi.fn();
    render(<BottomPanel log={log} snap={snap} model={model} hasResults onOpenResults={onOpenResults} />);
    fireEvent.click(screen.getByRole("button", { name: /open analysis/i }));
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
  test("inspector tab shows the selected entity details", () => {
    render(<BottomPanel log={log} snap={snap} model={model} selectedEntityId={2} />);

    fireEvent.click(screen.getByRole("tab", { name: /inspector/i }));
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Queue A")).toBeInTheDocument();
  });
});
