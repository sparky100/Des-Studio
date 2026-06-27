import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ExecuteActivityNode } from "../../../src/ui/execute/ExecuteActivityNode.jsx";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
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
});
