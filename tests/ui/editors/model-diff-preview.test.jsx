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

    fireEvent.click(screen.getByRole("button", { name: /apply selected/i }));
    fireEvent.click(screen.getByLabelText(/apply entity classes/i));
    fireEvent.click(screen.getByLabelText(/apply b-events/i));
    fireEvent.click(screen.getByLabelText(/apply c-events/i));
    fireEvent.click(screen.getByLabelText(/apply state variables/i));
    fireEvent.click(screen.getByRole("button", { name: /apply selected/i }));

    expect(onApply).toHaveBeenCalledOnce();
    const applied = onApply.mock.calls[0][0];
    expect(applied.entityTypes[0].name).toBe("Customer");
    expect(applied.queues[0].name).toBe("New Queue");
  });
});
