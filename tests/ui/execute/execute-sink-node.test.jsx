// ExecuteSinkNode's reneged/balked badges — previously fed a hardcoded
// `reneged: 0` from ExecuteCanvas's sink liveData block (dead code, could
// never render) and had no balked field at all. See ExecuteCanvas.jsx's
// `node.type === "sink"` liveData construction for the actual data source.
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ExecuteSinkNode } from "../../../src/ui/execute/ExecuteSinkNode.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", async () => {
  const actual = await vi.importActual("../../../src/ui/shared/xyflow.js");
  return { ...actual, Handle: () => null };
});

describe("ExecuteSinkNode — reneged/balked badges", () => {
  test("shows reneged and balked counts when both are nonzero", () => {
    render(
      <ExecuteSinkNode data={{ label: "Hire Complete", liveData: { served: 10, reneged: 3, balked: 2 } }} />
    );
    expect(screen.getByText("3 reneged")).toBeInTheDocument();
    expect(screen.getByText("2 balked")).toBeInTheDocument();
  });

  test("omits the reneged badge when reneged is 0", () => {
    render(
      <ExecuteSinkNode data={{ label: "Hire Complete", liveData: { served: 10, reneged: 0, balked: 2 } }} />
    );
    expect(screen.queryByText(/reneged/)).not.toBeInTheDocument();
    expect(screen.getByText("2 balked")).toBeInTheDocument();
  });

  test("omits the balked badge when balked is 0", () => {
    render(
      <ExecuteSinkNode data={{ label: "Hire Complete", liveData: { served: 10, reneged: 3, balked: 0 } }} />
    );
    expect(screen.getByText("3 reneged")).toBeInTheDocument();
    expect(screen.queryByText(/balked/)).not.toBeInTheDocument();
  });

  test("omits both badges when neither is present on liveData", () => {
    render(
      <ExecuteSinkNode data={{ label: "Hire Complete", liveData: { served: 10 } }} />
    );
    expect(screen.queryByText(/reneged/)).not.toBeInTheDocument();
    expect(screen.queryByText(/balked/)).not.toBeInTheDocument();
  });
});
