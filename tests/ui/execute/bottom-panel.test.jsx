// F9C.8 + F9C.9 — BottomPanel: tabs, collapse, Stage KPIs
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, test, expect } from "vitest";
import { BottomPanel } from "../../../src/ui/execute/BottomPanel.jsx";

vi.mock("../../../src/ui/shared/components.jsx", () => ({
  Tag:      ({ label }) => <span>{label}</span>,
  PhaseTag: ({ phase }) => <span>{phase}</span>,
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

describe("BottomPanel — F9C.8", () => {
  test("renders three active tabs and one disabled Charts tab", () => {
    render(<BottomPanel log={log} snap={snap} model={model} />);
    expect(screen.getByRole("tab", { name: /step log/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /entities/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /stage kpis/i })).toBeInTheDocument();
    const charts = screen.getByRole("tab", { name: /charts/i });
    expect(charts).toBeDisabled();
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
