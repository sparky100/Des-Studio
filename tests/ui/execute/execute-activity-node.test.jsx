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
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
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
