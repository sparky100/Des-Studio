// ExecuteResourceNode — the one canonical place overall per-resource-type
// utilisation now lives (previously repeated, identically, on every activity
// card referencing that resource type). Isolated render, mirroring
// execute-source-node.test.jsx's pattern.
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ExecuteResourceNode } from "../../../src/ui/execute/ExecuteResourceNode.jsx";

describe("ExecuteResourceNode", () => {
  test("shows capacity/busy, idle count, and utilisation %", () => {
    render(
      <ExecuteResourceNode data={{ label: "Staff", liveData: { capacity: 3, busyCount: 2, idleCount: 1, failedCount: 0, utilisation: 66.7 } }} />
    );
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("1 idle")).toBeInTheDocument();
    expect(screen.getByText("67% utilisation")).toBeInTheDocument();
  });

  test("shows a failed-server warning when failedCount > 0", () => {
    render(
      <ExecuteResourceNode data={{ label: "Staff", liveData: { capacity: 3, busyCount: 1, idleCount: 1, failedCount: 1, utilisation: 33 } }} />
    );
    expect(screen.getByText("⚠ 1 failed")).toBeInTheDocument();
  });

  test("renders a placeholder with no liveData, without crashing", () => {
    render(<ExecuteResourceNode data={{ label: "Staff", liveData: null }} />);
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
