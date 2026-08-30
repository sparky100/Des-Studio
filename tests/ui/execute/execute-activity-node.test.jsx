import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ExecuteActivityNode } from "../../../src/ui/execute/ExecuteActivityNode.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return {
    ...actual,
    Handle: () => null,
  };
});

const baseLiveData = { serverTypeName: "Staff", capacity: 3, busyCount: 1, activityBusyCount: 1, failedCount: 0, utilisation: 33 };

describe("ExecuteActivityNode", () => {
  test("renders failed server indicator without crashing", () => {
    render(
      <ExecuteActivityNode
        data={{
          label: "Serve Customer",
          liveData: {
            serverTypeName: "Clerk",
            capacity: 2,
            busyCount: 0,
            failedCount: 1,
            utilisation: 0,
            completionSignal: 0,
          },
        }}
      />
    );

    expect(screen.getByText("⚠ 1 failed")).toBeInTheDocument();
  });

  test("small pools (dot-grid) show a plain active count next to the boxes, and no utilisation %", () => {
    // Boxes alone previously required counting squares; a viewer asked for an
    // explicit count. The utilisation % (a pool-wide number duplicated across
    // every activity card sharing a resource) is dropped entirely.
    render(
      <ExecuteActivityNode
        data={{
          label: "Serve Hire Customer",
          liveData: {
            serverTypeName: "Staff", capacity: 3, busyCount: 2, activityBusyCount: 2,
            failedCount: 0, utilisation: 66.7, completionSignal: 0,
          },
        }}
      />
    );
    expect(screen.getByText("2 active")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  test("renders one row per server type for multi-resource (COSEIZE) activities", () => {
    render(
      <ExecuteActivityNode
        data={{
          label: "Surgery",
          liveData: {
            serverTypeName: "Surgeon",
            capacity: 2,
            busyCount: 1,
            activityBusyCount: 1,
            failedCount: 0,
            utilisation: 50,
            completionSignal: 0,
            perType: [
              { serverTypeName: "Surgeon", capacity: 2, busyCount: 1, activityBusyCount: 1, failedCount: 0, utilisation: 50 },
              { serverTypeName: "Anesthetist", capacity: 1, busyCount: 1, activityBusyCount: 1, failedCount: 0, utilisation: 100 },
            ],
          },
        }}
      />
    );

    expect(screen.getByText("Surgeon")).toBeInTheDocument();
    expect(screen.getByText("Anesthetist")).toBeInTheDocument();
    // Utilisation % was dropped (it's a pool-wide number, identical on every
    // activity card sharing a resource — see the "no % text anywhere" test
    // below) — each row instead shows its own plain active count.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getAllByText("1 active")).toHaveLength(2);
  });

  test("caps rendered rows at MAX_ROWS_SHOWN for a COSEIZE spanning many server types, with a '+N more' indicator", () => {
    // Without a cap, a COSEIZE across many resource types would grow this
    // node past the fixed height every Execute node now renders at.
    const perType = ["A", "B", "C", "D", "E"].map(name => ({
      serverTypeName: name, capacity: 1, busyCount: 0, activityBusyCount: 0, failedCount: 0, utilisation: 0,
    }));
    render(
      <ExecuteActivityNode data={{ label: "Multi-resource", liveData: { perType, completionSignal: 0 } }} />
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
    expect(screen.queryByText("E")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  test("shows no overflow indicator when row count is within the cap", () => {
    const perType = [
      { serverTypeName: "Surgeon", capacity: 2, busyCount: 1, activityBusyCount: 1, failedCount: 0, utilisation: 50 },
      { serverTypeName: "Anesthetist", capacity: 1, busyCount: 1, activityBusyCount: 1, failedCount: 0, utilisation: 100 },
    ];
    render(
      <ExecuteActivityNode data={{ label: "Surgery", liveData: { perType, completionSignal: 0 } }} />
    );
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  test("flashes only when THIS activity's own completionSignal increases, not an unrelated activity's", () => {
    // Regression: completionSignal used to be the model-wide snap.served
    // total, so every activity node flashed simultaneously whenever any
    // activity anywhere completed a job. It's now per-activity (see
    // activityLiveData.js's completionSignalFor), so a re-render carrying a
    // higher value for a *different* activity must not trigger this one.
    const { container, rerender } = render(
      <ExecuteActivityNode data={{ label: "Serve Hire Customer", liveData: { ...baseLiveData, completionSignal: 3 } }} />
    );
    const getBoxShadow = () => container.firstChild.style.boxShadow;
    expect(getBoxShadow()).toBe("none");

    // Unrelated activity's signal moved on; this one's own value is unchanged.
    rerender(
      <ExecuteActivityNode data={{ label: "Serve Hire Customer", liveData: { ...baseLiveData, completionSignal: 3 } }} />
    );
    expect(getBoxShadow()).toBe("none");

    // This activity's own signal increases — now it should flash.
    rerender(
      <ExecuteActivityNode data={{ label: "Serve Hire Customer", liveData: { ...baseLiveData, completionSignal: 4 } }} />
    );
    expect(getBoxShadow()).not.toBe("none");
  });

  test("renders at the fixed Execute card height regardless of content", () => {
    const { container } = render(
      <ExecuteActivityNode
        data={{
          label: "Serve Customer",
          liveData: { serverTypeName: "Clerk", capacity: 2, busyCount: 0, failedCount: 0, utilisation: 0, completionSignal: 0 },
        }}
      />
    );
    expect(container.firstChild).toHaveStyle({ height: "155px", overflow: "hidden" });
  });
});
