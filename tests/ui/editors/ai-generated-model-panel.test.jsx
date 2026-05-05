import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiGeneratedModelPanel } from "../../../src/ui/editors/AiGeneratedModelPanel.jsx";

const mockCallModelBuilder = vi.hoisted(() => vi.fn());

vi.mock("../../../src/llm/apiClient.js", () => ({
  callModelBuilder: mockCallModelBuilder,
}));

const model = {
  entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

describe("AiGeneratedModelPanel", () => {
  it("renders conversation input and handles a proposal response", async () => {
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      onComplete({
        intent: "build",
        questions: null,
        explanation: "Built a post office model.",
        proposedModel: {
          ...model,
          entityTypes: [...model.entityTypes, { id: "srv", name: "Clerk", role: "server", count: 2, attrDefs: [] }],
        },
      });
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A post office with 2 clerks" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockCallModelBuilder).toHaveBeenCalledOnce());
    expect(screen.getByText(/built a post office model/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument();
  });
});
