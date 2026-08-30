// ExecuteSourceNode's fixed card height — previously only a `minHeight: 78`
// floor; now pinned to the same fixed height every Execute node type shares
// (EXEC_CARD_HEIGHT), matching the Draw canvas's own fixed-box discipline.
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ExecuteSourceNode } from "../../../src/ui/execute/ExecuteSourceNode.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return { ...actual, Handle: () => null };
});

describe("ExecuteSourceNode", () => {
  test("renders at the fixed Execute card height", () => {
    const { container } = render(
      <ExecuteSourceNode data={{ label: "Hire Arrival", liveData: { clock: 10, nextArrivalTime: 15, interArrivalLabel: "Exp(mean=15)", arrivalKey: 3 } }} />
    );
    expect(container.firstChild).toHaveStyle({ height: "155px", overflow: "hidden" });
    expect(screen.getByText("Hire Arrival")).toBeInTheDocument();
  });

  test("renders with no liveData without crashing", () => {
    render(<ExecuteSourceNode data={{ label: "Hire Arrival", liveData: null }} />);
    expect(screen.getByText("Hire Arrival")).toBeInTheDocument();
  });
});
