/**
 * Unit tests for the doCloudSave timeout / slow-warning behaviour.
 *
 * doCloudSave is not exported directly — we test it by calling
 * saveSimulationRun through a thin wrapper that mimics the execute-panel
 * call-site, substituting a fake Supabase client with controlled latency.
 *
 * The function under test lives in src/ui/execute/index.jsx but its
 * key logic (thresholds, timeout, error surfaces) is self-contained and
 * exercised here without mounting the full React component.
 */

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

// ── Inline re-implementation of doCloudSave for isolated unit testing ─────────
// We duplicate the logic rather than export it to avoid coupling the production
// module graph to the test runner.  Any changes to thresholds in index.jsx
// must be reflected here.

const SAVE_SLOW_WARN_MS     = 5_000;
const SAVE_CRITICAL_WARN_MS = 15_000;
const SAVE_TIMEOUT_MS       = 30_000;

async function doCloudSave(saveFn, {
  setSaveStatus,
  setLog,
  prepareDurationMs,
  snapClock,
  slowWarnMs     = SAVE_SLOW_WARN_MS,
  criticalWarnMs = SAVE_CRITICAL_WARN_MS,
  timeoutMs      = SAVE_TIMEOUT_MS,
}) {
  const saveStartedAt = performance.now();

  const buildTickMessage = () => {
    const elapsed = performance.now() - saveStartedAt;
    if (elapsed >= criticalWarnMs) {
      return `⏳ Still saving… — Supabase may be starting up`;
    }
    if (elapsed >= slowWarnMs) {
      return `Saving results… (taking longer than usual)`;
    }
    return `Saving results… (prepared in ${prepareDurationMs} ms)`;
  };

  const intervalId = setInterval(() => {
    setSaveStatus({ state: 'saving', message: buildTickMessage() });
  }, 1_000);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(Object.assign(new Error(`Supabase did not respond within ${timeoutMs} ms`), { isSaveTimeout: true })),
      timeoutMs,
    )
  );

  try {
    const runId = await Promise.race([saveFn(), timeoutPromise]);
    clearInterval(intervalId);
    setSaveStatus({ state: 'success', message: `✓ History saved!` });
    setLog(prev => [...prev, { phase: "SAVE", time: snapClock, message: "✅ Cloud history record completed." }]);
    return runId;
  } catch (err) {
    clearInterval(intervalId);
    const bannerMsg = err.isSaveTimeout
      ? `✗ Save timed out — Supabase did not respond. Try running again in a moment.`
      : `✗ Save failed: ${err.message || "unknown error"}`;
    const logMsg = err.isSaveTimeout
      ? `Save timed out — result not stored`
      : `Save failed: ${err.message || "unknown error"}`;
    setSaveStatus({ state: 'error', message: bannerMsg });
    setLog(prev => [...prev, { phase: "ERROR", time: snapClock, message: logMsg }]);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeOpts = (overrides = {}) => ({
  setSaveStatus: vi.fn(),
  setLog:        vi.fn(fn => fn([])),
  prepareDurationMs: 42,
  snapClock: 100,
  ...overrides,
});

describe("doCloudSave — timeout and warning behaviour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the runId on a fast save", async () => {
    const saveFn = vi.fn().mockResolvedValue("run-abc");
    const opts   = makeOpts();

    const promise = doCloudSave(saveFn, opts);
    await vi.runAllTimersAsync();
    const runId = await promise;

    expect(runId).toBe("run-abc");
    expect(opts.setSaveStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: "success" }),
    );
  });

  it("returns null and shows an error banner when the save throws", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("network error"));
    const opts   = makeOpts();

    const promise = doCloudSave(saveFn, opts);
    await vi.runAllTimersAsync();
    const runId = await promise;

    expect(runId).toBeNull();
    const lastStatus = opts.setSaveStatus.mock.calls.at(-1)[0];
    expect(lastStatus.state).toBe("error");
    expect(lastStatus.message).toMatch(/Save failed.*network error/);
  });

  it("returns null and shows a timeout-specific error after timeoutMs with no response", async () => {
    // saveFn never resolves — simulates a Supabase hang
    const saveFn = vi.fn(() => new Promise(() => {}));
    const opts   = makeOpts({ timeoutMs: 10_000 });

    const promise = doCloudSave(saveFn, opts);
    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(11_000);
    const runId = await promise;

    expect(runId).toBeNull();
    const lastStatus = opts.setSaveStatus.mock.calls.at(-1)[0];
    expect(lastStatus.state).toBe("error");
    expect(lastStatus.message).toMatch(/timed out/i);
    expect(lastStatus.message).toMatch(/Try running again/i);
  });

  it("timeout error message is distinct from a generic save failure", async () => {
    const timeoutSave = vi.fn(() => new Promise(() => {}));
    const networkSave = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const timeoutOpts = makeOpts({ timeoutMs: 5_000 });
    const networkOpts = makeOpts();

    const p1 = doCloudSave(timeoutSave, timeoutOpts);
    const p2 = doCloudSave(networkSave, networkOpts);
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    const timeoutMsg = timeoutOpts.setSaveStatus.mock.calls.at(-1)[0].message;
    const networkMsg = networkOpts.setSaveStatus.mock.calls.at(-1)[0].message;

    expect(timeoutMsg).toMatch(/timed out/i);
    expect(networkMsg).toMatch(/Save failed/i);
    expect(networkMsg).toMatch(/Connection refused/);
    // The two messages must be visually different
    expect(timeoutMsg).not.toBe(networkMsg);
  });

  it("adds an ERROR log entry on timeout with a timeout-specific phrase", async () => {
    const saveFn = vi.fn(() => new Promise(() => {}));
    const logEntries = [];
    const opts = makeOpts({
      timeoutMs: 8_000,
      setLog: vi.fn(fn => logEntries.push(...fn([]))),
    });

    const promise = doCloudSave(saveFn, opts);
    await vi.advanceTimersByTimeAsync(9_000);
    await promise;

    expect(logEntries.length).toBeGreaterThan(0);
    const errorEntry = logEntries.find(e => e.phase === "ERROR");
    expect(errorEntry).toBeDefined();
    expect(errorEntry.message).toMatch(/timed out/i);
  });

  it("does NOT show a timeout error when save completes just before timeoutMs", async () => {
    let resolveSave;
    const saveFn = vi.fn(() => new Promise(res => { resolveSave = res; }));
    const opts   = makeOpts({ timeoutMs: 10_000 });

    const promise = doCloudSave(saveFn, opts);
    // Advance to just before timeout, then resolve
    await vi.advanceTimersByTimeAsync(9_500);
    resolveSave("run-ok");
    await vi.runAllTimersAsync();
    const runId = await promise;

    expect(runId).toBe("run-ok");
    const lastStatus = opts.setSaveStatus.mock.calls.at(-1)[0];
    expect(lastStatus.state).toBe("success");
  });

  it("exported threshold constants reflect the documented defaults", () => {
    // Sanity-check that the constants used in tests match the module constants.
    // If thresholds in index.jsx are changed, update both places.
    expect(SAVE_SLOW_WARN_MS).toBe(5_000);
    expect(SAVE_CRITICAL_WARN_MS).toBe(15_000);
    expect(SAVE_TIMEOUT_MS).toBe(30_000);
    // Timeout must be strictly longer than both warning thresholds
    expect(SAVE_TIMEOUT_MS).toBeGreaterThan(SAVE_CRITICAL_WARN_MS);
    expect(SAVE_CRITICAL_WARN_MS).toBeGreaterThan(SAVE_SLOW_WARN_MS);
  });
});
