import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutePanel } from "../../../src/ui/execute/index.jsx";

const mockRunReplications = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockSaveLocalRun = vi.hoisted(() => vi.fn());
const mockFetchLocalRunHistory = vi.hoisted(() => vi.fn(() => []));

vi.mock("../../../src/engine/replication-runner.js", () => ({
  runReplications: mockRunReplications,
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
}));

vi.mock("../../../src/db/local.js", () => ({
  saveLocalRun: mockSaveLocalRun,
  fetchLocalRunHistory: mockFetchLocalRunHistory,
}));

const validModel = {
  entityTypes: [
    { id: "et_customer", name: "Customer", role: "customer", count: 0, attrDefs: [] },
    { id: "et_server", name: "Server", role: "server", count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: "b_arrive",
      name: "Arrival",
      scheduledTime: "0",
      effect: "ARRIVE(Customer)",
      schedules: [],
    },
    {
      id: "b_complete",
      name: "Complete",
      scheduledTime: "9999",
      effect: "COMPLETE()",
      schedules: [],
    },
  ],
  cEvents: [],
  queues: [],
};

const largeAllowedModel = {
  ...validModel,
  entityTypes: [
    { id: "et_customer", name: "Customer", role: "customer", count: 12000, attrDefs: [] },
    { id: "et_server", name: "Server", role: "server", count: 1, attrDefs: [] },
  ],
};

function openSetup() {
  fireEvent.click(screen.getByRole("button", { name: /^setup$/i }));
  fireEvent.click(screen.getByRole("button", { name: /edit setup/i }));
}

describe("ExecutePanel run admission", () => {
  beforeEach(() => {
    mockRunReplications.mockReset();
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockFetchUserSettings.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
    mockSaveLocalRun.mockReset();
    mockFetchLocalRunHistory.mockReset();
    mockFetchLocalRunHistory.mockImplementation(() => []);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("blocks run-all when replications exceed the tier limit", async () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" plan="pro" />);

    openSetup();
    fireEvent.change(screen.getByLabelText(/replication count/i), { target: { value: "31" } });

    expect(screen.getAllByRole("button", { name: /blocker/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /batch run/i })).not.toBeInTheDocument();

    await waitFor(() => expect(mockRunReplications).not.toHaveBeenCalled());
    expect(mockSaveSimulationRun).not.toHaveBeenCalled();
  });

  it("auto-disables chart data for large allowed batch runs", async () => {
    mockRunReplications.mockImplementation(({ onReplicationComplete, onComplete }) => {
      const payloads = [
        {
          replicationIndex: 0,
          seed: 100,
          result: {
            snap: { clock: 10, entities: [], served: 1, reneged: 0 },
            summary: { total: 1, served: 1, reneged: 0, avgWait: 4, avgSvc: 2, avgSojourn: 6 },
            finalTime: 10,
          },
        },
        {
          replicationIndex: 1,
          seed: 101,
          result: {
            snap: { clock: 11, entities: [], served: 1, reneged: 0 },
            summary: { total: 1, served: 1, reneged: 0, avgWait: 5, avgSvc: 2, avgSojourn: 7 },
            finalTime: 11,
          },
        },
      ];
      payloads.forEach(payload => onReplicationComplete?.(payload));
      onComplete?.(payloads);
      return { cancel: vi.fn() };
    });

    render(<ExecutePanel model={largeAllowedModel} modelId="model-1" userId="user-1" plan="pro" />);

    openSetup();
    fireEvent.change(screen.getByLabelText(/replication count/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

    fireEvent.click(screen.getByRole("button", { name: /batch run/i }));

    await waitFor(() => expect(mockRunReplications).toHaveBeenCalledTimes(1));
    expect(mockRunReplications.mock.calls[0][0]).toEqual(
      expect.objectContaining({ collectTimeSeries: false, replications: 2 })
    );
    await screen.findByText(/batch results saved in this browser/i);
    expect(mockSaveSimulationRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /save fast history to cloud/i }));
    await waitFor(() => expect(mockSaveSimulationRun).toHaveBeenCalledWith(
      "model-1",
      "user-1",
      expect.any(Object),
      expect.objectContaining({
        requestedCollectTimeSeries: true,
        effectiveCollectTimeSeries: false,
      })
    ));
    expect(window.confirm).toHaveBeenCalled();
  });
});
