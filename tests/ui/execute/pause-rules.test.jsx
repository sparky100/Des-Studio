// Auto Run "Pause when…" (roadmap #6): rules are set in a panel beside Auto
// Run, kept per model in this browser, and stop Auto Run when one fires.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutePanel } from "../../../src/ui/execute/index.jsx";
import { loadPauseRules, savePauseRules } from "../../../src/ui/execute/pauseRules.js";

vi.mock("../../../src/db/models.js", () => ({
  fetchRunHistory: vi.fn(() => new Promise(() => {})),
  saveSimulationRun: vi.fn().mockResolvedValue("saved-run-id"),
  fetchUserSettings: vi.fn(() => new Promise(() => {})),
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
}));

const model = {
  entityTypes: [
    { id: "et-c", name: "Customer", role: "customer", attrDefs: [] },
    { id: "et-s", name: "Server", role: "server", count: 1, attrDefs: [] },
  ],
  queues: [{ id: "q-main", name: "Main Queue", customerType: "Customer", discipline: "FIFO" }],
  bEvents: [
    { id: "be-arrive", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Customer, Main Queue)",
      schedules: [{ eventId: "be-arrive", dist: "Fixed", distParams: { value: "1" } }] },
    { id: "be-complete", name: "Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [{
    id: "ce-serve", name: "Serve", priority: 1,
    condition: "queue(Main Queue).length > 0 AND idle(Server).count > 0",
    effect: "ASSIGN(Main Queue, Server)",
    cSchedules: [{ eventId: "be-complete", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }],
  }],
  stateVariables: [],
  experimentDefaults: { maxSimTime: 200 },
};

describe("Auto Run pause rules", () => {
  beforeEach(() => window.localStorage.clear());

  it("adds a condition from the panel and keeps it for the model", () => {
    render(<ExecutePanel model={model} modelId="m-pause" />);
    fireEvent.click(screen.getByRole("button", { name: /pause when/i }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition type"), { target: { value: "depth" } });
    fireEvent.change(screen.getByLabelText("Queue"), { target: { value: "Main Queue" } });
    fireEvent.change(screen.getByLabelText("Queue length"), { target: { value: "4" } });
    expect(loadPauseRules("m-pause")).toEqual([
      expect.objectContaining({ kind: "depth", queue: "Main Queue", count: 4, enabled: true }),
    ]);
    expect(screen.getByRole("button", { name: /pause when… \(1\)/i })).toBeTruthy();
  });

  it("stops Auto Run when a condition fires and says why", async () => {
    savePauseRules("m-pause", [{ id: "r1", kind: "depth", queue: "Main Queue", count: 3, enabled: true }]);
    render(<ExecutePanel model={model} modelId="m-pause" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^auto run$/i })); });
    const banner = await waitFor(() => screen.getByTestId("pause-hit-banner"), { timeout: 4000 });
    expect(banner.textContent).toMatch(/Main Queue reached 3 waiting/);
    expect(screen.getByRole("button", { name: /^auto run$/i })).toBeTruthy();
  });
});
