// ExecuteQueueNode's renege/balk pulse — the visual cue for the case
// detectRoutingEvents can't animate a token for at all: an entity that
// reneges or balks straight out of a queue, never entering an activity.
// Mirrors ExecuteSourceNode's own arrival-pulse pattern (strictly-increasing
// key watched via useEffect, skip-on-mount, self-expiring flash).
import { render, screen, act } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { ExecuteQueueNode } from "../../../src/ui/execute/ExecuteQueueNode.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return { ...actual, Handle: () => null };
});

const baseLiveData = { depth: 2, entities: [], discipline: "FIFO", clock: 10 };

describe("ExecuteQueueNode — renege/balk pulse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("does not flash on initial mount even if a pulse is already present", () => {
    render(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 5 } } }} />
    );
    expect(screen.queryByText("balked")).not.toBeInTheDocument();
  });

  test("flashes the status label when the pulse key increases on a later render", () => {
    const { rerender } = render(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 5 } } }} />
    );
    rerender(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "reneged", key: 6 } } }} />
    );
    expect(screen.getByText("reneged")).toBeInTheDocument();
  });

  test("the flash clears itself after the pulse duration", () => {
    const { rerender } = render(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 1 } } }} />
    );
    rerender(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 2 } } }} />
    );
    expect(screen.getByText("balked")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText("balked")).not.toBeInTheDocument();
  });

  test("does not re-flash when the pulse key is unchanged across renders", () => {
    const { rerender } = render(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 3 } } }} />
    );
    rerender(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 4 } } }} />
    );
    act(() => vi.advanceTimersByTime(600)); // let the real flash (3 → 4) expire
    rerender(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, renegeBalkPulse: { status: "balked", key: 4 } } }} />
    );
    expect(screen.queryByText("balked")).not.toBeInTheDocument();
  });

  test("renders normally with no pulse at all", () => {
    render(<ExecuteQueueNode data={{ label: "Hire Queue", liveData: baseLiveData }} />);
    expect(screen.getByText("Hire Queue")).toBeInTheDocument();
    expect(screen.queryByText("reneged")).not.toBeInTheDocument();
    expect(screen.queryByText("balked")).not.toBeInTheDocument();
  });

  test("renders at the fixed Execute card height regardless of content", () => {
    const { container } = render(
      <ExecuteQueueNode data={{ label: "Hire Queue", liveData: { ...baseLiveData, entities: Array.from({ length: 12 }, (_, i) => ({ id: i, type: "Customer" })) } }} />
    );
    expect(container.firstChild).toHaveStyle({ height: "155px", overflow: "hidden" });
  });
});
