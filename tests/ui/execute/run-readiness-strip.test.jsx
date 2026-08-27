// Run readiness collapses to one line by default (advisory count still
// visible), expands on demand, and a genuine hard blocker always shows full
// detail — never a one-line "Blocked" mystery.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutePanel } from "../../../src/ui/execute/index.jsx";

const mockRunReplications = vi.hoisted(() => vi.fn());
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchModelSchedules = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../../../src/engine/replication-runner.js", () => ({
  runReplications: mockRunReplications,
  createReplicationPool: () => ({ destroyed: false, get: vi.fn(), destroy: vi.fn() }),
}));

vi.mock("../../../src/db/models.js", () => ({
  fetchRunHistory: mockFetchRunHistory,
  saveSimulationRun: vi.fn().mockResolvedValue(undefined),
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: mockFetchModelSchedules,
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

function openSetup() {
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
}

describe("ExecutePanel — run readiness strip", () => {
  beforeEach(() => {
    mockRunReplications.mockReset();
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
    mockFetchModelSchedules.mockClear();
    mockFetchModelSchedules.mockResolvedValue([]);
  });

  it("defaults to one collapsed line with a Details control, and expands on click", async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);
    // Flush the fetchModelSchedules() microtask before interacting, so its
    // resolution doesn't land as a post-test act() warning.
    await waitFor(() => expect(mockFetchModelSchedules).toHaveBeenCalled());

    expect(screen.getByText("Ready to run")).toBeInTheDocument();
    expect(screen.queryByText("RUN READINESS")).not.toBeInTheDocument();
    expect(screen.queryByText("No blocking issues found for this scenario.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Details ▸"));
    expect(screen.getByText("RUN READINESS")).toBeInTheDocument();
    expect(screen.getByText("No blocking issues found for this scenario.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("▴ Collapse"));
    expect(screen.queryByText("RUN READINESS")).not.toBeInTheDocument();
  });

  it("shows the advisory count in the collapsed line without the advisory text", async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);
    await waitFor(() => expect(mockFetchModelSchedules).toHaveBeenCalled());
    openSetup();
    fireEvent.click(screen.getByLabelText(/when a rule becomes true/i));

    expect(screen.getByText(/^\d+ advisor(y|ies)$/)).toBeInTheDocument();
    expect(screen.queryByText(/\[RA10\]/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Details ▸"));
    expect(screen.getByText(/\[RA10\]/)).toBeInTheDocument();
  });

  it("shows full detail automatically for a hard blocker, with no collapse control", async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);
    await waitFor(() => expect(mockFetchModelSchedules).toHaveBeenCalled());
    openSetup();
    fireEvent.change(screen.getByLabelText(/replication count/i), { target: { value: "31" } });

    expect(screen.getByText("RUN READINESS")).toBeInTheDocument();
    expect(screen.getByText(/\[RA3\]/)).toBeInTheDocument();
    expect(screen.queryByText("▴ Collapse")).not.toBeInTheDocument();
    expect(screen.queryByText("Details ▸")).not.toBeInTheDocument();
  });
});
