// StakeholderRunCanvas — lets a signed-in viewer collaborator watch a single
// illustrative pass of the model actually run (animated canvas), alongside
// (never instead of) StakeholderView's N-replication statistical Run.
//
// The auto-loop is driven via a mocked setInterval so tests can advance it
// deterministically by invoking the captured callback, instead of racing a
// real 350ms timer. setInterval/clearInterval are spied globally, so calls
// are filtered to this component's own AUTO_SPEED_MS delay — @testing-
// library/dom's async utilities (findBy/waitFor) install their own internal
// interval-based real-timers check, which would otherwise be mistaken for
// ours. ExecuteCanvas is lazy-loaded (React.lazy/Suspense) same as
// ExecutePanel's — tests await its first appearance before asserting on it.
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StakeholderRunCanvas } from "../../src/ui/StakeholderRunCanvas.jsx";
import { ThemeProvider } from "../../src/ui/shared/ThemeContext.jsx";
import { createSampleMm1Model } from "../../src/App.jsx";

const AUTO_SPEED_MS = 350;

const mockBuildEngine = vi.hoisted(() => vi.fn());
const mockSaveSimulationRun = vi.hoisted(() => vi.fn());
const mockFetchUserSettings = vi.hoisted(() => vi.fn());
const mockSaveUserSettings = vi.hoisted(() => vi.fn());
const mockSaveLocalRun = vi.hoisted(() => vi.fn());

vi.mock("../../src/engine/index.js", async () => {
  const actual = await vi.importActual("../../src/engine/index.js");
  return { ...actual, buildEngine: mockBuildEngine };
});
vi.mock("../../src/db/models.js", async () => {
  const actual = await vi.importActual("../../src/db/models.js");
  return {
    ...actual,
    saveSimulationRun: mockSaveSimulationRun,
    fetchUserSettings: mockFetchUserSettings,
    saveUserSettings: mockSaveUserSettings,
  };
});
vi.mock("../../src/db/local.js", () => ({
  saveLocalRun: mockSaveLocalRun,
  fetchLocalRunHistory: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../src/ui/execute/ExecuteCanvas.jsx", () => ({
  ExecuteCanvas: ({ snap }) => <div data-testid="execute-canvas" data-clock={snap?.clock ?? ""} />,
}));

const validModel = { ...createSampleMm1Model(), id: "m1", experimentDefaults: { maxSimTime: 100, warmupPeriod: 0 } };
// admission mirrors what StakeholderView already computed for its own Run
// button gate, on the unpatched model — StakeholderRunCanvas never
// recomputes this itself (see the note at the top of the source file for why).
const validAdmission = { hardErrors: [], warnings: [], complexityEstimate: {} };
const blockedAdmission = { hardErrors: [{ code: "V1", message: "The model has a problem." }], warnings: [], complexityEstimate: {} };

function makeFakeEngine(totalSteps) {
  let i = 0;
  return {
    getSnap: () => ({ clock: 0, entities: [] }),
    step: () => {
      i += 1;
      return { done: i >= totalSteps, cycleLog: [], snap: { clock: i, entities: [] } };
    },
  };
}

function renderCanvas(props = {}) {
  return render(
    <ThemeProvider>
      <StakeholderRunCanvas
        model={validModel}
        warmupPeriod={0}
        maxSimTime={100}
        terminationMode="time"
        terminationCondition={null}
        seed={0}
        admission={validAdmission}
        onClose={vi.fn()}
        {...props}
      />
    </ThemeProvider>
  );
}

describe("StakeholderRunCanvas", () => {
  // Only setInterval calls at AUTO_SPEED_MS are the component's own auto-loop —
  // testing-library's findBy/waitFor install an unrelated internal interval
  // (a different delay) to detect fake timers, which must not be conflated with it.
  let intervalCallback;
  let ourIntervalId;
  let ourIntervalCount;
  let clearedIds;
  let nextId;

  beforeEach(() => {
    vi.clearAllMocks();
    intervalCallback = null;
    ourIntervalId = null;
    ourIntervalCount = 0;
    clearedIds = [];
    nextId = 1;
    vi.spyOn(global, "setInterval").mockImplementation((fn, ms) => {
      const id = nextId++;
      if (ms === AUTO_SPEED_MS) { intervalCallback = fn; ourIntervalId = id; ourIntervalCount += 1; }
      return id;
    });
    vi.spyOn(global, "clearInterval").mockImplementation((id) => { clearedIds.push(id); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the engine on mount, auto-plays, and stops with an illustrative note on completion", async () => {
    mockBuildEngine.mockReturnValue(makeFakeEngine(3));

    renderCanvas();
    expect(await screen.findByTestId("execute-canvas")).toHaveAttribute("data-clock", "0");

    expect(mockBuildEngine).toHaveBeenCalledTimes(1);
    expect(ourIntervalCount).toBe(1);

    act(() => { intervalCallback(); });
    expect(screen.getByTestId("execute-canvas")).toHaveAttribute("data-clock", "1");
    expect(clearedIds).not.toContain(ourIntervalId);

    act(() => { intervalCallback(); });
    act(() => { intervalCallback(); }); // 3rd step: done

    expect(screen.getByTestId("execute-canvas")).toHaveAttribute("data-clock", "3");
    expect(clearedIds).toContain(ourIntervalId);
    expect(screen.getByText(/this is one illustrative run/i)).toBeInTheDocument();
    expect(screen.getByText(/click run above for the full statistical result/i)).toBeInTheDocument();
  });

  it("never saves or persists anything from this flow", async () => {
    mockBuildEngine.mockReturnValue(makeFakeEngine(2));
    renderCanvas();
    await screen.findByTestId("execute-canvas");

    act(() => { intervalCallback(); });
    act(() => { intervalCallback(); });

    expect(mockSaveSimulationRun).not.toHaveBeenCalled();
    expect(mockSaveLocalRun).not.toHaveBeenCalled();
    expect(mockFetchUserSettings).not.toHaveBeenCalled();
    expect(mockSaveUserSettings).not.toHaveBeenCalled();
  });

  it("shows the friendly blocked message and never builds an engine for a model that can't run", () => {
    renderCanvas({ admission: blockedAdmission });

    expect(screen.getByText(/a problem only its owner can fix/i)).toBeInTheDocument();
    expect(mockBuildEngine).not.toHaveBeenCalled();
    expect(ourIntervalCount).toBe(0);
  });

  it("Pause stops the loop, Resume restarts it, and Reset rebuilds a fresh engine", async () => {
    mockBuildEngine.mockReturnValueOnce(makeFakeEngine(10)).mockReturnValueOnce(makeFakeEngine(10));
    renderCanvas();
    await screen.findByTestId("execute-canvas");
    const firstIntervalId = ourIntervalId;

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(clearedIds).toContain(firstIntervalId);

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    expect(ourIntervalCount).toBe(2);
    const secondIntervalId = ourIntervalId;

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(clearedIds).toContain(secondIntervalId);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(mockBuildEngine).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("execute-canvas")).toHaveAttribute("data-clock", "0");
  });

  it("Close calls onClose, and unmounting stops the interval so no further steps run", async () => {
    mockBuildEngine.mockReturnValue(makeFakeEngine(10));
    const onClose = vi.fn();
    const { unmount } = renderCanvas({ onClose });
    await screen.findByTestId("execute-canvas");
    const intervalId = ourIntervalId;

    fireEvent.click(screen.getByRole("button", { name: /back to settings/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(clearedIds).toContain(intervalId);
  });
});
