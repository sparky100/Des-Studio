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
});
