import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildModelDiff, ModelDiffPreview } from "../../../src/ui/editors/ModelDiffPreview.jsx";

const baseModel = {
  entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [{ id: "q1", name: "Old Queue", discipline: "FIFO" }],
};

describe("ModelDiffPreview", () => {
  it("identifies an added entity class and removed queue", () => {
    const proposed = {
      ...baseModel,
      entityTypes: [...baseModel.entityTypes, { id: "srv", name: "Server", role: "server", count: 1, attrDefs: [] }],
      queues: [],
    };

    const diff = buildModelDiff(baseModel, proposed);

    expect(diff.find(section => section.key === "entityTypes").diff.added[0].name).toBe("Server");
    expect(diff.find(section => section.key === "queues").diff.removed[0].name).toBe("Old Queue");
  });

  it("applies only selected sections", () => {
    const onApply = vi.fn();
    const proposed = {
      ...baseModel,
      entityTypes: [{ id: "cust", name: "Customer Updated", role: "customer", attrDefs: [] }],
      queues: [{ id: "q2", name: "New Queue", discipline: "FIFO" }],
    };

    render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={onApply} onDiscard={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^apply selected$/i }));
    fireEvent.click(screen.getByLabelText(/apply entity classes/i));
    fireEvent.click(screen.getByLabelText(/apply b-events/i));
    fireEvent.click(screen.getByLabelText(/apply c-events/i));
    fireEvent.click(screen.getByLabelText(/apply state variables/i));
    fireEvent.click(screen.getByRole("button", { name: /^apply selected$/i }));

    expect(onApply).toHaveBeenCalledOnce();
    const applied = onApply.mock.calls[0][0];
    expect(applied.entityTypes[0].name).toBe("Customer");
    expect(applied.queues[0].name).toBe("New Queue");
  });

  it("can apply invalid proposals as editable drafts when allowed", () => {
    const onApply = vi.fn();
    const proposed = {
      ...baseModel,
      entityTypes: [{ id: "bad", name: "", role: "customer", attrDefs: [] }],
    };

    render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={onApply} onDiscard={vi.fn()} allowDraftApply />);

    fireEvent.click(screen.getByRole("button", { name: /apply all/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/applied as a draft/i);
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][1].errors[0].code).toBe("V1");
  });

  it("can apply and save all sections in one action", () => {
    const onApplyAndSave = vi.fn();
    const proposed = {
      ...baseModel,
      queues: [{ id: "q2", name: "Saved Queue", discipline: "FIFO" }],
    };

    render(
      <ModelDiffPreview
        currentModel={baseModel}
        proposedModel={proposed}
        onApply={vi.fn()}
        onApplyAndSave={onApplyAndSave}
        onDiscard={vi.fn()}
        allowDraftApply
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /apply & save all/i }));

    expect(onApplyAndSave).toHaveBeenCalledOnce();
    expect(onApplyAndSave.mock.calls[0][0].queues[0].name).toBe("Saved Queue");
  });
});
