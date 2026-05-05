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

  it("unwraps exported-style model_json proposals and applies them as drafts", async () => {
    const handleApply = vi.fn();
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      onComplete({
        intent: "build",
        questions: null,
        explanation: "Built a clinic model.",
        proposedModel: {
          id: "llm-should-not-be-used",
          name: "Generated Clinic",
          model_json: {
            entityTypes: [{ id: "patient", name: "Patient", role: "customer", attrDefs: [] }],
            stateVariables: [],
            bEvents: [],
            cEvents: [],
            queues: [{ id: "waiting", name: "Waiting", discipline: "FIFO" }],
          },
        },
      });
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A GP practice" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply all/i }));

    expect(handleApply).toHaveBeenCalledOnce();
    expect(handleApply.mock.calls[0][0]).not.toHaveProperty("id");
    expect(handleApply.mock.calls[0][0].name).toBe("Generated Clinic");
    expect(handleApply.mock.calls[0][0].queues[0].name).toBe("Waiting");
  });

  it("saves a proposal directly from the proposal panel", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      onComplete({
        intent: "build",
        questions: null,
        explanation: "Built a model.",
        proposedModel: {
          ...model,
          queues: [{ id: "waiting", name: "Waiting", discipline: "FIFO" }],
        },
      });
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} onSaveModel={handleSave} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A post office" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply & save all/i }));

    await waitFor(() => expect(handleSave).toHaveBeenCalledOnce());
    expect(handleSave.mock.calls[0][0].queues[0].name).toBe("Waiting");
  });
});
