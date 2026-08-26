import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ScenarioManagerPanel } from "../../src/ui/ScenarioManagerPanel.jsx";
import { ThemeProvider } from "../../src/ui/shared/ThemeContext.jsx";
import { createScenario, deleteScenario, listScenarios } from "../../src/db/scenarios.js";
import { runReplications } from "../../src/engine/replication-runner.js";

vi.mock("../../src/db/scenarios.js", () => ({
  createScenario: vi.fn(),
  deleteScenario: vi.fn(),
  listScenarios: vi.fn(),
}));

vi.mock("../../src/engine/replication-runner.js", () => ({
  runReplications: vi.fn(),
}));

const MODEL = {
  id: "model-1",
  entityTypes: [
    { id: "et_srv", name: "Clerk", role: "server", count: "1" },
    { id: "et_cust", name: "Customer", role: "customer", count: "0" },
  ],
  queues: [],
  bEvents: [],
  cEvents: [],
  stateVariables: [],
};

function repsOf(values) {
  return values.map(v => ({ result: { summary: { avgWait: v } } }));
}

function mockRunReplicationsOnce(reps) {
  runReplications.mockImplementationOnce((opts) => { opts.onComplete(reps); });
}

function renderPanel(props = {}) {
  return render(
    <ThemeProvider>
      <ScenarioManagerPanel model={MODEL} userId="user-1" {...props} />
    </ThemeProvider>
  );
}

describe("ScenarioManagerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listScenarios.mockResolvedValue([]);
  });

  it("renders nothing without a signed-in user", () => {
    listScenarios.mockClear();
    const { container } = render(
      <ThemeProvider>
        <ScenarioManagerPanel model={MODEL} userId={null} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
    expect(listScenarios).not.toHaveBeenCalled();
  });

  it("loads and lists saved scenarios for the model on mount", async () => {
    listScenarios.mockResolvedValue([
      { id: "s1", name: "Double clerks", param_deltas: [{ paramConfig: {}, value: 2 }], replications: 5, base_seed: 1 },
    ]);

    renderPanel();

    expect(await screen.findByText("Double clerks")).toBeInTheDocument();
    expect(listScenarios).toHaveBeenCalledWith("model-1");
  });

  it("creates a new scenario from the form and refreshes the list", async () => {
    listScenarios.mockResolvedValueOnce([]);
    createScenario.mockResolvedValue("new-scenario-id");
    listScenarios.mockResolvedValueOnce([
      { id: "new-scenario-id", name: "More clerks", param_deltas: [{ paramConfig: {}, value: 3 }], replications: 10, base_seed: null },
    ]);

    renderPanel();
    await waitFor(() => expect(listScenarios).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /new scenario/i }));
    fireEvent.change(screen.getByPlaceholderText(/scenario name/i), { target: { value: "More clerks" } });

    const paramSelect = screen.getByRole("combobox");
    fireEvent.change(paramSelect, { target: { value: "entityTypes.et_srv.count" } });
    fireEvent.change(screen.getByPlaceholderText("new value"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    fireEvent.click(screen.getByRole("button", { name: /save scenario/i }));

    await waitFor(() => expect(createScenario).toHaveBeenCalledWith(
      "model-1",
      "user-1",
      expect.objectContaining({ name: "More clerks" })
    ));
    expect(await screen.findByText("More clerks")).toBeInTheDocument();
  });

  it("requires a name and at least one parameter change before saving", async () => {
    renderPanel();
    await waitFor(() => expect(listScenarios).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /new scenario/i }));
    fireEvent.click(screen.getByRole("button", { name: /save scenario/i }));

    expect(await screen.findByText(/name the scenario/i)).toBeInTheDocument();
    expect(createScenario).not.toHaveBeenCalled();
  });

  it("deletes a scenario and removes it from the list", async () => {
    listScenarios.mockResolvedValue([
      { id: "s1", name: "Doomed scenario", param_deltas: [], replications: 1, base_seed: null },
    ]);
    deleteScenario.mockResolvedValue(undefined);

    renderPanel();
    await screen.findByText("Doomed scenario");

    fireEvent.click(screen.getByRole("button", { name: /delete scenario doomed scenario/i }));

    await waitFor(() => expect(deleteScenario).toHaveBeenCalledWith("s1"));
    expect(screen.queryByText("Doomed scenario")).not.toBeInTheDocument();
  });

  it("compares the base model against one saved scenario with the 2-group paired-t view", async () => {
    listScenarios.mockResolvedValue([
      { id: "s1", name: "Scenario A", param_deltas: [], replications: 5, base_seed: 1 },
    ]);
    mockRunReplicationsOnce(repsOf([10, 11, 9, 10, 11])); // base
    mockRunReplicationsOnce(repsOf([20, 21, 19, 20, 21])); // scenario A

    renderPanel();
    await screen.findByText("Scenario A");

    fireEvent.click(screen.getByLabelText(/base model/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /scenario a/i }));
    fireEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    await waitFor(() => expect(runReplications).toHaveBeenCalledTimes(2));
    // 2-group compare renders the paired-t ScenarioComparisonTable, not the
    // ANOVA/Tukey metric picker (which only appears for 3+ groups).
    expect(screen.queryByText(/pairwise comparisons/i)).not.toBeInTheDocument();
  });

  it("compares 3+ selected groups with the ANOVA/Tukey view and shows the metric picker", async () => {
    listScenarios.mockResolvedValue([
      { id: "s1", name: "Scenario A", param_deltas: [], replications: 5, base_seed: 1 },
      { id: "s2", name: "Scenario B", param_deltas: [], replications: 5, base_seed: 2 },
    ]);
    mockRunReplicationsOnce(repsOf([10, 11, 9, 10, 11]));
    mockRunReplicationsOnce(repsOf([20, 21, 19, 20, 21]));
    mockRunReplicationsOnce(repsOf([10.5, 9.5, 10, 11, 9]));

    renderPanel();
    await screen.findByText("Scenario A");

    fireEvent.click(screen.getByLabelText(/base model/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /scenario a/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /scenario b/i }));

    // 3+ selection reveals the compare-metric picker.
    const metricSelects = screen.getAllByRole("combobox");
    expect(metricSelects.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    await waitFor(() => expect(runReplications).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(/pairwise comparisons \(tukey hsd\)/i)).toBeInTheDocument();
  });

  it("surfaces a comparison error instead of throwing when a replication run fails", async () => {
    listScenarios.mockResolvedValue([
      { id: "s1", name: "Scenario A", param_deltas: [], replications: 5, base_seed: 1 },
    ]);
    runReplications.mockImplementationOnce((opts) => { opts.onError(new Error("engine exploded")); });

    renderPanel();
    await screen.findByText("Scenario A");

    fireEvent.click(screen.getByLabelText(/base model/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /scenario a/i }));
    fireEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    expect(await screen.findByText(/engine exploded/i)).toBeInTheDocument();
  });
});
