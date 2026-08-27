// ParamBrowserPanel — the shared searchable, grouped parameter browser used
// by the sweep pickers, experiment overrides, Business view curation, and the
// scenario manager. First isolated coverage (it previously rode along only in
// sweep-2d.test.jsx).
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { ParamBrowserPanel, paramColor } from "../../../src/ui/shared/ParamBrowserPanel.jsx";
import { ThemeProvider } from "../../../src/ui/shared/ThemeContext.jsx";

const PARAMS = [
  { type: "entityTypeCount", label: "Number of Teller", description: "How many tellers work the counter", currentValue: 2, path: "entityTypes.et-1.count" },
  { type: "shiftCapacity", label: "Nurse — shift 3 capacity", subLabel: "from minute 1320", description: "Staff on the night shift", currentValue: 4, path: "entityTypes.et-2.shift.2" },
  { type: "queueCapacity", label: "Main Queue — maximum capacity", description: "Queue cap", currentValue: Infinity, path: "queues.q-1.capacity" },
  { type: "bEventDistParam", label: "Arrivals — mean", description: "Average time between arrivals", currentValue: 5, path: "bEvents.b-1.mean" },
  { type: "stateVarInit", label: "stock — starting value", description: "Initial stock level", currentValue: 10, path: "stateVariables.stock.init" },
];

function renderPanel(props = {}) {
  return render(
    <ThemeProvider>
      <ParamBrowserPanel params={PARAMS} onSelect={vi.fn()} onClose={vi.fn()} {...props} />
    </ThemeProvider>
  );
}

describe("ParamBrowserPanel", () => {
  test("shows grouped sections with count badges when the search is empty", () => {
    renderPanel();
    expect(screen.getByText("Servers & Capacity")).toBeInTheDocument();
    expect(screen.getByText("Arrival Distributions")).toBeInTheDocument();
    expect(screen.getByText("State Variables")).toBeInTheDocument();
    expect(screen.getByText("Queue Capacity")).toBeInTheDocument();
    // Servers & Capacity holds both the plain count and the shift-capacity
    // param, and opens by default (it's the first non-empty group).
    expect(screen.getByRole("button", { name: /^number of teller/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shift 3 capacity/i })).toBeInTheDocument();
  });

  test("search flattens the groups and matches label, subLabel, and description", () => {
    renderPanel();
    const search = screen.getByPlaceholderText(/filter parameters/i);

    fireEvent.change(search, { target: { value: "teller" } });          // label match
    expect(screen.getByRole("button", { name: /^number of teller/i })).toBeInTheDocument();
    expect(screen.queryByText("Servers & Capacity")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "minute 1320" } });     // subLabel match
    expect(screen.getByRole("button", { name: /shift 3 capacity/i })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "between arrivals" } }); // description match
    expect(screen.getByRole("button", { name: /^arrivals — mean/i })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz-no-match" } });
    expect(screen.getByText(/no parameters match/i)).toBeInTheDocument();
  });

  test("selecting a row reports its path; singleSelect also closes the panel", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderPanel({ onSelect, onClose, singleSelect: true });

    fireEvent.change(screen.getByPlaceholderText(/filter parameters/i), { target: { value: "teller" } });
    fireEvent.click(screen.getByRole("button", { name: /^number of teller/i }));

    expect(onSelect).toHaveBeenCalledWith("entityTypes.et-1.count");
    expect(onClose).toHaveBeenCalled();
  });

  test("alreadyAdded paths render disabled and don't fire onSelect", () => {
    const onSelect = vi.fn();
    renderPanel({ onSelect, alreadyAdded: new Set(["entityTypes.et-1.count"]) });

    fireEvent.change(screen.getByPlaceholderText(/filter parameters/i), { target: { value: "teller" } });
    const row = screen.getByRole("button", { name: /^number of teller/i });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("an unlimited queue capacity shows as ∞, not Infinity", () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/filter parameters/i), { target: { value: "maximum capacity" } });
    expect(screen.getByText("∞")).toBeInTheDocument();
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
  });

  test("empty params list shows the no-parameters message and no search box", () => {
    renderPanel({ params: [] });
    expect(screen.getByText(/no parameters available/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/filter parameters/i)).not.toBeInTheDocument();
  });

  test("paramColor maps every param type family to a distinct themed colour", () => {
    const C = { server: "s", green: "g", bEvent: "b", cEvent: "c", muted: "m" };
    expect(paramColor("entityTypeCount", C)).toBe("s");
    expect(paramColor("shiftCapacity", C)).toBe("s");
    expect(paramColor("queueCapacity", C)).toBe("g");
    expect(paramColor("bEventDistParam", C)).toBe("b");
    expect(paramColor("bEventPiecewisePeriodParam", C)).toBe("b");
    expect(paramColor("cEventDistParam", C)).toBe("c");
    expect(paramColor("cEventPiecewisePeriodParam", C)).toBe("c");
    expect(paramColor("stateVarInit", C)).toBe("m");
  });
});
