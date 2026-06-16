import { describe, test, expect, vi, beforeEach } from "vitest";

// Set up globalThis.self with a postMessage spy BEFORE sweep-worker.js is
// imported, so the `if (typeof self !== "undefined" && typeof self.postMessage === "function")`
// guard in the module passes and self.onmessage gets registered.
const mockPostMessage = vi.hoisted(() => {
  const fn = vi.fn();
  globalThis.self = { postMessage: fn };
  return fn;
});

const mockRun2DSweep = vi.hoisted(() => vi.fn());

vi.mock("../../src/engine/sweep-runner.js", () => ({
  run2DSweep: (...args) => mockRun2DSweep(...args),
  runSweep: vi.fn(),
  runSweepOffthread: vi.fn(),
}));

// Import executes the module body — sets globalThis.self.onmessage.
import "../../src/engine/sweep-worker.js";

function sendMessage(data) {
  globalThis.self.onmessage({ data });
}

function postedTypes() {
  return mockPostMessage.mock.calls.map(([m]) => m.type);
}

beforeEach(() => {
  mockPostMessage.mockClear();
  mockRun2DSweep.mockClear();
});

describe("sweep-worker message protocol", () => {
  test("SWEEP_START calls run2DSweep with payload fields", () => {
    mockRun2DSweep.mockReturnValue({ cancel: vi.fn() });

    const payload = {
      model: { entityTypes: [] },
      paramConfigs: [{ label: "X" }, { label: "Y" }],
      ranges: [{ min: 1, max: 2, step: 1 }, { min: 1, max: 2, step: 1 }],
      replications: 1,
      baseSeed: 0,
    };
    sendMessage({ type: "SWEEP_START", payload });

    expect(mockRun2DSweep).toHaveBeenCalledOnce();
    const opts = mockRun2DSweep.mock.calls[0][0];
    expect(opts.model).toEqual(payload.model);
    expect(opts.paramConfigs).toEqual(payload.paramConfigs);
  });

  test("SWEEP_PROGRESS is posted when onProgress is called", () => {
    const progressPayload = { totalPoints: 4, currentPoint: 1, gridSize: { rows: 2, cols: 2 } };
    mockRun2DSweep.mockImplementation((opts) => {
      opts.onProgress(progressPayload);
      return { cancel: vi.fn() };
    });

    sendMessage({ type: "SWEEP_START", payload: {} });

    expect(postedTypes()).toContain("SWEEP_PROGRESS");
    const msg = mockPostMessage.mock.calls.find(([m]) => m.type === "SWEEP_PROGRESS");
    expect(msg[0].payload).toEqual(progressPayload);
  });

  test("SWEEP_POINT_COMPLETE is posted when onPointComplete is called", () => {
    const pointResult = { valueA: 1, valueB: 2, aggregateStats: {} };
    const meta = { completedPoints: 1, totalPoints: 4 };
    mockRun2DSweep.mockImplementation((opts) => {
      opts.onPointComplete(pointResult, meta);
      return { cancel: vi.fn() };
    });

    sendMessage({ type: "SWEEP_START", payload: {} });

    const msg = mockPostMessage.mock.calls.find(([m]) => m.type === "SWEEP_POINT_COMPLETE");
    expect(msg).toBeDefined();
    expect(msg[0].payload.pointResult).toEqual(pointResult);
    expect(msg[0].payload.meta).toEqual(meta);
  });

  test("SWEEP_COMPLETE is posted when onComplete is called", () => {
    const results = [{ valueA: 1, valueB: 1, aggregateStats: {} }];
    mockRun2DSweep.mockImplementation((opts) => {
      opts.onComplete(results);
      return { cancel: vi.fn() };
    });

    sendMessage({ type: "SWEEP_START", payload: {} });

    expect(postedTypes()).toContain("SWEEP_COMPLETE");
    const msg = mockPostMessage.mock.calls.find(([m]) => m.type === "SWEEP_COMPLETE");
    expect(msg[0].payload.results).toEqual(results);
  });

  test("SWEEP_ERROR is posted when onError is called", () => {
    const error = { message: "boom", stack: "" };
    mockRun2DSweep.mockImplementation((opts) => {
      opts.onError(error);
      return { cancel: vi.fn() };
    });

    sendMessage({ type: "SWEEP_START", payload: {} });

    expect(postedTypes()).toContain("SWEEP_ERROR");
    const msg = mockPostMessage.mock.calls.find(([m]) => m.type === "SWEEP_ERROR");
    expect(msg[0].payload).toEqual(error);
  });

  test("SWEEP_CANCELLED is posted when onCancelled is called", () => {
    const partial = { results: [], completedPoints: 0, totalPoints: 4 };
    mockRun2DSweep.mockImplementation((opts) => {
      opts.onCancelled(partial);
      return { cancel: vi.fn() };
    });

    sendMessage({ type: "SWEEP_START", payload: {} });

    expect(postedTypes()).toContain("SWEEP_CANCELLED");
    const msg = mockPostMessage.mock.calls.find(([m]) => m.type === "SWEEP_CANCELLED");
    expect(msg[0].payload).toEqual(partial);
  });

  test("SWEEP_CANCEL calls cancel() on the active sweep handle", () => {
    const cancelFn = vi.fn();
    mockRun2DSweep.mockReturnValue({ cancel: cancelFn });

    sendMessage({ type: "SWEEP_START", payload: {} });
    sendMessage({ type: "SWEEP_CANCEL" });

    expect(cancelFn).toHaveBeenCalledOnce();
  });

  test("unknown message types are silently ignored", () => {
    sendMessage({ type: "BOGUS_TYPE", payload: {} });
    expect(mockRun2DSweep).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  test("null/undefined data is handled without throwing", () => {
    expect(() => sendMessage(null)).not.toThrow();
    expect(() => sendMessage(undefined)).not.toThrow();
  });
});
