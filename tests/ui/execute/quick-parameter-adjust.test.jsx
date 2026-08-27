// Run tab "Adjust parameters" — the same "change a value, then run" capability the
// Business view already gives viewer-role users (exposedParams + StakeholderView),
// now available to modellers on the main Run canvas without creating a saved
// Experiment or Scenario first. Ad-hoc overrides flow through the same
// effectiveModel/applySweepValues plumbing that a loaded Experiment already used.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutePanel } from "../../../src/ui/execute/index.jsx";

const mockRunReplications = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue("saved-run-id"));
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));

vi.mock("../../../src/engine/replication-runner.js", () => ({
  runReplications: mockRunReplications,
  createReplicationPool: () => ({ destroyed: false, get: vi.fn(), destroy: vi.fn() }),
}));

vi.mock("../../../src/db/models.js", () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: mockSaveSimulationRun,
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
}));

const validModel = {
  entityTypes: [
    { id: "et_customer", name: "Customer", role: "customer", count: 0, attrDefs: [] },
    { id: "et_server", name: "Server", role: "server", count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Customer)", schedules: [] },
    { id: "b_complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [],
  queues: [],
};

function openAdjustPanel() {
  fireEvent.click(screen.getByRole("button", { name: /adjust parameters/i }));
}

describe("ExecutePanel — Run tab ad-hoc parameter adjustment", () => {
  beforeEach(() => {
    mockRunReplications.mockReset();
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockFetchUserSettings.mockReset();
    mockSaveSimulationRun.mockResolvedValue("saved-run-id");
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
    mockRunReplications.mockImplementation(() => ({ cancel: vi.fn() }));
  });

  it("shows an 'Adjust parameters' trigger on the Run tab, with no experiment or scenario required", () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);
    expect(screen.getByRole("button", { name: /adjust parameters/i })).toBeInTheDocument();
  });

  it("lets a modeller change a parameter and run it immediately, with the override applied to the run model", async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);

    // A single-replication Batch Run drives the engine directly rather than via
    // runReplications() — bump to 2 replications so this exercises that path.
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/replication count/i), { target: { value: "2" } });

    openAdjustPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.click(screen.getByRole("button", { name: /^number of server/i }));

    const valueInput = screen.getByLabelText(/override value 1/i);
    expect(valueInput).toHaveValue(1); // pre-filled from the model's current value
    fireEvent.change(valueInput, { target: { value: "3" } });

    // The trigger now reflects one active override — no Experiment/Scenario was ever created.
    expect(screen.getByRole("button", { name: /1 param/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /batch run/i }));

    await waitFor(() => expect(mockRunReplications).toHaveBeenCalledTimes(1));
    const runArgs = mockRunReplications.mock.calls[0][0];
    const patchedServer = runArgs.model.entityTypes.find(et => et.id === "et_server");
    expect(patchedServer.count).toBe("3");
    // The base model prop itself is never mutated — applySweepValues clones.
    expect(validModel.entityTypes.find(et => et.id === "et_server").count).toBe(1);
  });

  it("'Reset all' clears the override and its badge", () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);

    openAdjustPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.click(screen.getByRole("button", { name: /^number of server/i }));
    expect(screen.getByRole("button", { name: /1 param/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reset all/i }));
    expect(screen.getByRole("button", { name: /^🎛 adjust parameters$/i })).toBeInTheDocument();
  });

  it("clears ad-hoc overrides when the model changes, so they never carry over to a different model", () => {
    const { rerender } = render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);

    openAdjustPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.click(screen.getByRole("button", { name: /^number of server/i }));
    expect(screen.getByRole("button", { name: /1 param/i })).toBeInTheDocument();

    rerender(<ExecutePanel model={validModel} modelId="model-2" userId="user-1" plan="pro" />);
    expect(screen.getByRole("button", { name: /^🎛 adjust parameters$/i })).toBeInTheDocument();
  });

  it("'Save as Experiment…' pre-fills the New Experiment form with the ad-hoc override, without having required one to run", async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);

    openAdjustPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.click(screen.getByRole("button", { name: /^number of server/i }));

    fireEvent.click(screen.getByRole("button", { name: /save as experiment/i }));

    // Landed on the Experiments tab with the New Experiment form open, override
    // carried over, and Name left blank — saving is offered, not required.
    expect(await screen.findByLabelText(/experiment name/i)).toHaveValue("");
    expect(screen.getByLabelText(/override value 1/i)).toHaveValue(1);
  });
});
