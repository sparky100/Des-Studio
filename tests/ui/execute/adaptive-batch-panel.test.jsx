import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdaptiveBatchPanel } from "../../../src/ui/execute/AdaptiveBatchPanel.jsx";
import { runAdaptiveBatch } from "../../../src/engine/adaptive-batch.js";

vi.mock("../../../src/engine/adaptive-batch.js", () => ({
  runAdaptiveBatch: vi.fn(),
}));

vi.mock("../../../src/llm/apiClient.js", () => ({
  streamNarrative: vi.fn(),
  streamModelBuilder: vi.fn(),
}));

const invalidModel = {
  name: "",
  entityTypes: [{ name: "" }],
  bEvents: [],
  cEvents: [],
  queues: [],
};

describe("AdaptiveBatchPanel", () => {
  it("uses plain Explore copy without plan text in the opening description", () => {
    const { container } = render(
      <AdaptiveBatchPanel
        model={invalidModel}
        tier="pro"
        onClose={vi.fn()}
      />
    );

    expect(container.textContent).toContain("Explore will run up to 100 replications of the model");
    expect(container.textContent).toContain("then provide an analysis of the results.");
    expect(container.textContent).not.toContain("(pro plan)");
  });

  it("does not offer a run action when blocking issues are present", () => {
    render(
      <AdaptiveBatchPanel
        model={invalidModel}
        tier="pro"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Cannot run/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Proceed/i })).toBeNull();
    expect(runAdaptiveBatch).not.toHaveBeenCalled();
  });
});
