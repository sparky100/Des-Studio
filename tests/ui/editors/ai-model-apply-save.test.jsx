import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelDetail } from "../../../src/ui/ModelDetail.jsx";

const mockCallModelBuilder = vi.hoisted(() => vi.fn());
const mockStreamModelBuilder = vi.hoisted(() => vi.fn());

vi.mock("../../../src/llm/apiClient.js", () => ({
  callModelBuilder: mockCallModelBuilder,
  streamModelBuilder: mockStreamModelBuilder,
}));

const baseModel = {
  id: "real-model-id",
  name: "Draft",
  description: "",
  visibility: "private",
  owner_id: "user-1",
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

describe("AI generated model apply/save flow", () => {
  it("marks the model dirty and saves using the existing model identity", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const response = {
      intent: "build",
      explanation: "Generated a draft.",
      proposedModel: {
        id: "generated-id",
        name: "Generated GP",
        entityTypes: [{ id: "patient", name: "Patient", role: "customer", attrDefs: [] }],
        stateVariables: [],
        bEvents: [],
        cEvents: [],
        queues: [],
      },
    };
    mockStreamModelBuilder.mockResolvedValue(response);
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
        intent: "build",
        explanation: "Generated a draft.",
        proposedModel: {
          id: "generated-id",
          name: "Generated GP",
          entityTypes: [{ id: "patient", name: "Patient", role: "customer", attrDefs: [] }],
          stateVariables: [],
          bEvents: [],
          cEvents: [],
          queues: [],
        },
      };
      onComplete(response);
      return response;
    });

    render(
      <ModelDetail
        modelId="real-model-id"
        modelData={baseModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ canEdit: true, isOwner: true, userId: "user-1", onSave: handleSave }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: /^describe$/i }));
    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Create a GP practice" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /^apply & save$/i }));

    await waitFor(() => expect(handleSave).toHaveBeenCalledOnce());
    expect(handleSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: "real-model-id",
      name: "Generated GP",
    }));
    expect(handleSave.mock.calls[0][0].entityTypes[0].name).toBe("Patient");
  });
});
