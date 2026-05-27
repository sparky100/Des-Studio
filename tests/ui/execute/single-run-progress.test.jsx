import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutePanel } from "../../../src/ui/execute/index.jsx";

const mockBuildEngine = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchRunHistory = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchUserSettings = vi.hoisted(() => vi.fn(() => new Promise(() => {})));

vi.mock("../../../src/engine/index.js", async () => {
  const actual = await vi.importActual("../../../src/engine/index.js");
  return {
    ...actual,
    buildEngine: mockBuildEngine,
  };
});

vi.mock("../../../src/engine/replication-runner.js", () => ({
  runReplications: vi.fn(),
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

vi.mock("../../../src/llm/apiClient.js", () => ({
  streamNarrative: vi.fn(),
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

function makeMockEngine(totalCycles = 120) {
  let cycle = 0;

  const makeResult = (options = {}) => ({
    finalTime: cycle,
    log: options.cancelled
      ? [{ phase: "CANCEL", time: cycle, message: options.message }]
      : [{ phase: "END", time: cycle, message: "done" }],
    snap: { clock: cycle, entities: [], served: 0, reneged: 0, scalars: {} },
    summary: { total: 0, served: 0, reneged: 0, avgWait: null, avgSvc: null, avgSojourn: null, warnings: [] },
    runtimeMetrics: {
      wall_clock_ms: null,
      replications: 1,
      events_processed: cycle,
      c_event_scans: 0,
      c_events_fired: 0,
      entities_created: 0,
      entities_completed: 0,
    },
    phaseCTruncated: false,
    warnings: [],
    entitySummary: [],
    waitDist: {},
    ...(options.cancelled ? { cancelled: true, partial: true, completionStatus: "cancelled" } : {}),
  });

  return {
    step() {
      if (cycle >= totalCycles) {
        return { done: true, phaseCTruncated: false };
      }
      cycle += 1;
      return { done: false, phaseCTruncated: false };
    },
    getProgress(overrides = {}) {
      const cancelled = !!overrides.cancelled;
      const done = !!overrides.done || cancelled || cycle >= totalCycles;
      return {
        mode: "single",
        completed: cycle,
        total: 5000,
        running: done ? 0 : 1,
        pending: 0,
        cancelled,
        workerCount: 1,
        clock: cycle,
        felSize: Math.max(0, totalCycles - cycle),
        eventsProcessed: cycle,
        maxCycles: 5000,
        terminationMode: "time",
      };
    },
    buildResult(options = {}) {
      return makeResult(options);
    },
  };
}

describe("ExecutePanel single-run progress", () => {
  beforeEach(() => {
    mockBuildEngine.mockReset();
    mockSaveSimulationRun.mockReset();
    mockFetchRunHistory.mockReset();
    mockFetchUserSettings.mockReset();
    mockSaveSimulationRun.mockResolvedValue(undefined);
    mockFetchRunHistory.mockImplementation(() => new Promise(() => {}));
    mockFetchUserSettings.mockImplementation(() => new Promise(() => {}));
  });

  it("renders single-run progress state while a run is underway", async () => {
    mockBuildEngine.mockImplementation(() => makeMockEngine(2000));

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: /run all/i }));

    expect(await screen.findByText("SINGLE RUN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel run/i })).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Cycle ") && text.includes("FEL"))).toBeInTheDocument();
    expect(screen.getByText(/Events processed:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    await waitFor(() => expect(screen.getByText("cancelled")).toBeInTheDocument());
  });

  it("labels cancelled runs clearly and skips persistence", async () => {
    mockBuildEngine.mockImplementation(() => makeMockEngine(2000));

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: /run all/i }));
    await screen.findByText("SINGLE RUN");

    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));

    await waitFor(() => expect(screen.getByText("cancelled")).toBeInTheDocument());
    expect(screen.getByText(/Partial results were not saved/i)).toBeInTheDocument();
    expect(mockSaveSimulationRun).not.toHaveBeenCalled();
  });
});
