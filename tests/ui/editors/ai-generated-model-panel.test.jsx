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

  it("normalizes structured predicate JSON conditions before applying proposals", async () => {
    const handleApply = vi.fn();
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      onComplete({
        intent: "build",
        questions: null,
        explanation: "Built a model.",
        proposedModel: {
          ...model,
          entityTypes: [
            { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
            { id: "clerk", name: "Clerk", role: "server", count: 2, attrDefs: [] },
          ],
          queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
          cEvents: [{
            id: "start",
            name: "Start Service",
            priority: 1,
            condition: {
              operator: "AND",
              clauses: [
                { variable: "Queue.Main Queue.length", operator: ">", value: 0 },
                { variable: "Resource.Clerk.idleCount", operator: ">", value: 0 },
              ],
            },
            cSchedules: [],
          }],
        },
      });
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A post office" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply all/i }));

    expect(handleApply).toHaveBeenCalledOnce();
    expect(handleApply.mock.calls[0][0].cEvents[0].condition)
      .toBe("queue(Main Queue).length > 0 AND idle(Clerk).count > 0");
  });

  it("normalizes AI timing answers into schedule and service-time distributions", async () => {
    const handleApply = vi.fn();
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      onComplete({
        intent: "build",
        questions: null,
        explanation: "Built a post office model.",
        proposedModel: {
          entityTypes: [
            { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
            { id: "clerk", name: "Clerk", role: "server", count: 2, attrDefs: [
              { id: "svc", name: "serviceTime", valueType: "number", defaultValue: 7.5 },
            ] },
          ],
          stateVariables: [],
          queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
          bEvents: [{
            id: "arrive",
            name: "Customer Arrival",
            scheduledTime: "0",
            effect: "ARRIVE(Customer, Main Queue)",
            schedules: [{ eventId: "arrive", type: "exponential", mean: 5 }],
          }, {
            id: "complete",
            name: "Service Complete (template)",
            scheduledTime: "0",
            effect: ["COMPLETE()"],
            schedules: [],
          }],
          cEvents: [{
            id: "start",
            name: "Start Service",
            priority: 1,
            condition: { variable: "Queue.Main Queue.length", operator: ">", value: 0 },
            actions: [{ macro: "ASSIGN", args: ["Main Queue", "Clerk"] }],
            schedules: [{ eventId: "complete", type: "fixed", value: 7.5, useEntityCtx: true }],
          }],
        },
      });
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Post office, arrivals 5 mins, service 7.5 mins" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply all/i }));

    expect(handleApply).toHaveBeenCalledOnce();
    const applied = handleApply.mock.calls[0][0];
    expect(applied.bEvents[0].schedules[0]).toEqual(expect.objectContaining({
      dist: "Exponential",
      distParams: { mean: "5" },
    }));
    expect(applied.entityTypes[1].attrDefs[0]).toEqual(expect.objectContaining({
      dist: "Fixed",
      distParams: { value: "7.5" },
    }));
    expect(applied.bEvents[1]).toEqual(expect.objectContaining({
      name: "Service Complete",
      scheduledTime: "9999",
      effect: ["COMPLETE()"],
    }));
    expect(applied.cEvents[0]).toEqual(expect.objectContaining({
      condition: "queue(Main Queue).length > 0 AND idle(Clerk).count > 0",
      effect: ["ASSIGN(Main Queue, Clerk)"],
    }));
    expect(applied.cEvents[0].cSchedules[0]).toEqual(expect.objectContaining({
      eventId: "complete",
      dist: "Fixed",
      distParams: { value: "7.5" },
      useEntityCtx: true,
    }));
  });
});
