// State Variables tab in the Execute BottomPanel — live values, change history,
// and flash-on-change.
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { BottomPanel } from "../../../src/ui/execute/BottomPanel.jsx";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock("../../../src/ui/shared/components.jsx", () => ({
  Tag:      ({ label }) => <span>{label}</span>,
  PhaseTag: ({ phase }) => <span>{phase}</span>,
  Btn:      ({ children, onClick, disabled, small, variant }) =>
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-small={small}>{children}</button>,
}));

const model = {
  stateVariables: [
    { id: "sv1", name: "arrivals", initialValue: "0", description: "Total arrivals" },
    { id: "sv2", name: "hormuzOpen", initialValue: "1", description: "Strait open?" },
  ],
  queues: [],
  entityTypes: [],
};

const snap = {
  clock: 12,
  scalars: { arrivals: 7, hormuzOpen: 1 },
  entities: [],
};

const stateChanges = [
  { time: 0,  variable: "arrivals",   from: 0, to: 1, sourceEventId: "arr", sourceEventName: "Arrive", phase: "B" },
  { time: 5,  variable: "hormuzOpen", from: 1, to: 0, sourceEventId: "be-closure", sourceEventName: "Strait Closes", phase: "B" },
  { time: 8,  variable: "arrivals",   from: 1, to: 2, sourceEventId: "arr", sourceEventName: "Arrive", phase: "B" },
  { time: 10, variable: "hormuzOpen", from: 0, to: 1, sourceEventId: "ce-reopen", sourceEventName: "Reopen Strait", phase: "C" },
];

const openStateVarsTab = () => {
  render(<BottomPanel log={[]} snap={snap} model={model} stateChanges={stateChanges} />);
  fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
  fireEvent.click(screen.getByRole("tab", { name: /state variables/i }));
};

const currentValuesSection = () => screen.getByText("CURRENT VALUES").parentElement;
const historySection = () => screen.getByText("CHANGE HISTORY").parentElement;

describe("BottomPanel State Variables tab", () => {
  test("renders the State Variables tab in the tab bar", () => {
    render(<BottomPanel log={[]} snap={snap} model={model} />);
    expect(screen.getByRole("tab", { name: /state variables/i })).toBeInTheDocument();
  });

  test("shows an empty state when the model declares no state variables", () => {
    render(<BottomPanel log={[]} snap={snap} model={{ stateVariables: [], queues: [], entityTypes: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    fireEvent.click(screen.getByRole("tab", { name: /state variables/i }));
    expect(screen.getByText(/no state variables defined/i)).toBeInTheDocument();
  });

  test("shows current values for each declared variable", () => {
    openStateVarsTab();
    const section = currentValuesSection();
    expect(within(section).getByText("arrivals")).toBeInTheDocument();
    expect(within(section).getByText("hormuzOpen")).toBeInTheDocument();
    expect(within(section).getByText("7")).toBeInTheDocument();
    expect(within(section).getByText("Total arrivals")).toBeInTheDocument();
  });

  test("shows change history attributing each write to its source event and phase", () => {
    openStateVarsTab();
    const section = historySection();
    expect(within(section).getByText("Strait Closes")).toBeInTheDocument();
    expect(within(section).getByText("Reopen Strait")).toBeInTheDocument();
    expect(within(section).getAllByText("B-event").length).toBeGreaterThan(0);
    expect(within(section).getAllByText("C-event").length).toBeGreaterThan(0);
    expect(within(section).getAllByText("0 →").length).toBeGreaterThan(0);
  });

  test("history is shown most-recent-first", () => {
    openStateVarsTab();
    const rows = within(historySection()).getAllByText(/t=/);
    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain("t=10");
  });

  test("flashes a variable row when its value changes between snapshots", () => {
    vi.useFakeTimers();
    const { rerender } = render(<BottomPanel log={[]} snap={snap} model={model} stateChanges={stateChanges} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    fireEvent.click(screen.getByRole("tab", { name: /state variables/i }));

    const arrivalsRow = () => within(currentValuesSection()).getByText("arrivals").closest("div").parentElement;
    const initialBg = arrivalsRow().style.background;

    const nextSnap = { ...snap, scalars: { ...snap.scalars, arrivals: 8 } };
    rerender(<BottomPanel log={[]} snap={nextSnap} model={model} stateChanges={[...stateChanges, { time: 12, variable: "arrivals", from: 7, to: 8, sourceEventId: "arr", sourceEventName: "Arrive", phase: "B" }]} />);
    expect(arrivalsRow().style.background).not.toBe(initialBg);

    act(() => { vi.advanceTimersByTime(700); });
    rerender(<BottomPanel log={[]} snap={nextSnap} model={model} stateChanges={stateChanges} />);
    expect(arrivalsRow().style.background).toBe(initialBg);
  });
});