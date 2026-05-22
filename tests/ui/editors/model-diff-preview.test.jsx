import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={onApply} onDiscard={vi.fn()} allowDraftApply />);

    // Expand technical changes to access section checkboxes
    fireEvent.click(screen.getByText(/show technical changes/i));
    fireEvent.click(screen.getByRole("button", { name: /^apply selected$/i }));
    fireEvent.click(screen.getByLabelText(/apply entity classes/i));
    fireEvent.click(screen.getByLabelText(/apply b-events/i));
    fireEvent.click(screen.getByLabelText(/apply c-events/i));
    fireEvent.click(screen.getByLabelText(/apply model data/i));
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

    fireEvent.click(screen.getByRole("button", { name: /apply model/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/applied as a draft/i);
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][1].errors[0].code).toBe("V1");
  });

  it("summarises modified proposal items without dumping raw JSON", () => {
    const proposed = {
      ...baseModel,
      queues: [{ id: "q1", name: "Old Queue", discipline: "LIFO", capacity: "12" }],
    };

    render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={vi.fn()} onDiscard={vi.fn()} />);

    // Expand technical changes to see diff content
    fireEvent.click(screen.getByText(/show technical changes/i));

    expect(screen.getByText("Old Queue")).toBeInTheDocument();
    expect(screen.getByText("discipline")).toBeInTheDocument();
    expect(screen.getByText("FIFO")).toBeInTheDocument();
    expect(screen.getByText("LIFO")).toBeInTheDocument();
    expect(screen.getByText("capacity")).toBeInTheDocument();
    expect(screen.getByText("blank")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/"discipline"/i)).not.toBeInTheDocument();
  });

  it("can apply and save all sections in one action", async () => {
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

    await waitFor(() => expect(onApplyAndSave).toHaveBeenCalledOnce());
    expect(onApplyAndSave.mock.calls[0][0].queues[0].name).toBe("Saved Queue");
  });

  it("shows a saving state while applying and saving a proposal", async () => {
    let resolveSave;
    const onApplyAndSave = vi.fn(() => new Promise(resolve => {
      resolveSave = resolve;
    }));
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

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();

    resolveSave();
    await waitFor(() => expect(screen.getByRole("button", { name: /apply & save all/i })).not.toBeDisabled());
  });

  it("renders simulation summary card with entity and arrival info", () => {
    const proposed = {
      entityTypes: [
        { id: "cust", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
      ],
      stateVariables: [],
      bEvents: [{
        id: "arrive",
        name: "Patient Arrival",
        scheduledTime: "0",
        effect: "ARRIVE(Patient, Waiting)",
        schedules: [{ eventId: "arrive", dist: "Exponential", distParams: { mean: "8" } }],
      }],
      cEvents: [],
      queues: [{ id: "q", name: "Waiting Room", discipline: "FIFO" }],
    };

    render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={vi.fn()} onDiscard={vi.fn()} />);

    expect(screen.getByLabelText(/simulation summary/i)).toBeInTheDocument();
    expect(screen.getByText(/patient.*flowing/i)).toBeInTheDocument();
    expect(screen.getByText(/1 every 8 time units/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting Room/)).toBeInTheDocument();
    expect(screen.getByText(/2× Nurse/)).toBeInTheDocument();
  });

  it("renders llmExplanation as italic quote when provided", () => {
    const proposed = { ...baseModel };

    render(
      <ModelDiffPreview
        currentModel={baseModel}
        proposedModel={proposed}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        llmExplanation="A simple post office model with two clerks."
      />
    );

    expect(screen.getByText(/simple post office model/i)).toBeInTheDocument();
  });

  it("calls onRefine when Refine this button is clicked", () => {
    const onRefine = vi.fn();
    const proposed = { ...baseModel };

    render(
      <ModelDiffPreview
        currentModel={baseModel}
        proposedModel={proposed}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        onRefine={onRefine}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /refine this/i }));
    expect(onRefine).toHaveBeenCalledOnce();
  });

  it("shows technical changes toggle and reveals diff on click", () => {
    const proposed = {
      ...baseModel,
      queues: [{ id: "q2", name: "New Queue", discipline: "FIFO" }],
    };

    render(<ModelDiffPreview currentModel={baseModel} proposedModel={proposed} onApply={vi.fn()} onDiscard={vi.fn()} />);

    // Technical changes hidden by default
    expect(screen.queryByText(/sections changed/i)).not.toBeInTheDocument();

    // Click toggle
    fireEvent.click(screen.getByText(/show technical changes/i));

    // Now diff stats visible
    expect(screen.getByText(/sections changed/i)).toBeInTheDocument();
  });
});
