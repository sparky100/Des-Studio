import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiGeneratedModelPanel } from "../../../src/ui/editors/AiGeneratedModelPanel.jsx";

const { mockCallModelBuilder, mockStreamModelBuilder } = vi.hoisted(() => {
  const call = vi.fn();
  return {
    mockCallModelBuilder: call,
    mockStreamModelBuilder: vi.fn((systemPrompt, messages, options = {}) =>
      call(systemPrompt, messages, options.onComplete || (() => {}), options.onError || (() => {}))
    ),
  };
});

vi.mock("../../../src/llm/apiClient.js", () => ({
  callModelBuilder: mockCallModelBuilder,
  streamModelBuilder: mockStreamModelBuilder,
}));

const model = {
  entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
};

describe("AiGeneratedModelPanel", () => {
  it("plays back the new model description and asks one question before building", async () => {
    const describedModel = {
      name: "Clinic Draft",
      description: "Patients arrive at a small clinic and wait to see a doctor.",
      entityTypes: [],
      stateVariables: [],
      bEvents: [],
      cEvents: [],
      queues: [],
    };

    render(<AiGeneratedModelPanel model={describedModel} canEdit onApplyModel={vi.fn()} />);

    expect(await screen.findByText(/Here is what I understand about "Clinic Draft"/i)).toBeInTheDocument();
    expect(screen.getByText(/Patients arrive at a small clinic/i)).toBeInTheDocument();
    expect(screen.getByText(/Before I build it:/i)).toBeInTheDocument();
    expect(mockCallModelBuilder).not.toHaveBeenCalled();
  });

  it("renders conversation input and handles a proposal response", async () => {
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
        intent: "build",
        questions: null,
        explanation: "Built a post office model.",
        proposedModel: {
          ...model,
          entityTypes: [...model.entityTypes, { id: "srv", name: "Clerk", role: "server", count: 2, attrDefs: [] }],
        },
      };
      onComplete(response);
      return response;
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
      const response = {
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
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A GP practice" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply model/i }));

    expect(handleApply).toHaveBeenCalledOnce();
    expect(handleApply.mock.calls[0][0]).not.toHaveProperty("id");
    expect(handleApply.mock.calls[0][0].name).toBe("Generated Clinic");
    expect(handleApply.mock.calls[0][0].queues[0].name).toBe("Waiting");
  });

  it("saves a proposal directly from the proposal panel", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
        intent: "build",
        questions: null,
        explanation: "Built a model.",
        proposedModel: {
          ...model,
          queues: [{ id: "waiting", name: "Waiting", discipline: "FIFO" }],
        },
      };
      onComplete(response);
      return response;
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
      const response = {
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
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A post office" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply model/i }));

    expect(handleApply).toHaveBeenCalledOnce();
    expect(handleApply.mock.calls[0][0].cEvents[0].condition)
      .toEqual({
        operator: "AND",
        clauses: [
          { variable: "queue(Main Queue).length", operator: ">", value: 0 },
          { variable: "idle(Clerk).count", operator: ">", value: 0 },
        ],
      });
  });

  it("normalizes AI timing answers into schedule and service-time distributions", async () => {
    const handleApply = vi.fn();
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
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
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Post office, arrivals 5 mins, service 7.5 mins" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply model/i }));

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
      condition: {
        operator: "AND",
        clauses: [
          { variable: "queue(Main Queue).length", operator: ">", value: 0 },
          { variable: "idle(Clerk).count", operator: ">", value: 0 },
        ],
      },
      effect: ["ASSIGN(Main Queue, Clerk)"],
    }));
    expect(applied.cEvents[0].cSchedules[0]).toEqual(expect.objectContaining({
      eventId: "complete",
      dist: "Fixed",
      distParams: { value: "7.5" },
      useEntityCtx: true,
    }));
  });

  it("infers missing arrival and service effects from AI proposal structure", async () => {
    const handleApply = vi.fn();
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
        intent: "build",
        questions: null,
        explanation: "Built a queueing model.",
        proposedModel: {
          entityTypes: [
            { id: "cust", name: "Customer", role: "customer", attrDefs: [] },
            { id: "clerk", name: "Clerk", role: "server", count: 1, attrDefs: [] },
          ],
          stateVariables: [],
          queues: [{ id: "waiting", name: "Waiting", customerType: "Customer", discipline: "FIFO" }],
          bEvents: [{
            id: "arrival",
            name: "Customer Arrival",
            scheduledTime: "0",
            schedules: [{ type: "exponential", mean: 5 }],
          }, {
            id: "complete",
            name: "Service Complete",
            scheduledTime: "0",
            schedules: [],
          }],
          cEvents: [{
            id: "start",
            name: "Service",
            priority: 1,
            condition: {
              operator: "AND",
              clauses: [
                { variable: "Queue.Waiting.length", operator: ">", value: 0 },
                { variable: "Resource.Clerk.idleCount", operator: ">", value: 0 },
              ],
            },
            cSchedules: [{ eventId: "complete", type: "fixed", value: 7.5 }],
          }],
        },
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A simple queue" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply model/i }));

    const applied = handleApply.mock.calls[0][0];
    expect(applied.bEvents.find(event => event.id === "arrival")).toEqual(expect.objectContaining({
      effect: "ARRIVE(Customer, Waiting)",
      schedules: [expect.objectContaining({ eventId: "arrival" })],
    }));
    expect(applied.cEvents[0]).toEqual(expect.objectContaining({
      effect: "ASSIGN(Waiting, Clerk)",
      condition: {
        operator: "AND",
        clauses: [
          { variable: "queue(Waiting).length", operator: ">", value: 0 },
          { variable: "idle(Clerk).count", operator: ">", value: 0 },
        ],
      },
    }));
    expect(applied.cEvents[0].cSchedules[0]).toEqual(expect.objectContaining({
      eventId: "complete",
      useEntityCtx: true,
    }));
    expect(applied.bEvents.find(event => event.id === "complete")).toEqual(expect.objectContaining({
      scheduledTime: "9999",
      effect: "COMPLETE()",
    }));
  });

  describe("voice input (F14.5)", () => {
    let mockSpeechRecognition;
    let mockRecognitionInstance;

    beforeEach(() => {
      mockRecognitionInstance = {
        start: vi.fn(),
        stop: vi.fn(),
        continuous: false,
        interimResults: false,
        lang: "",
        onresult: null,
        onend: null,
        onerror: null,
      };
      mockSpeechRecognition = vi.fn(() => mockRecognitionInstance);
    });

    it("renders a microphone button with correct aria-label", () => {
      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
    });

    it("shows error message when SpeechRecognition is unavailable", () => {
      const origSpeech = window.SpeechRecognition;
      const origWebkit = window.webkitSpeechRecognition;
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
      expect(screen.getByText(/voice input is not supported/i)).toBeInTheDocument();

      window.SpeechRecognition = origSpeech;
      window.webkitSpeechRecognition = origWebkit;
    });

    it("starts speech recognition and toggles to stop button", () => {
      window.SpeechRecognition = mockSpeechRecognition;

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
      expect(mockRecognitionInstance.start).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: /stop voice input/i })).toBeInTheDocument();
    });

    it("stops recognition and toggles back to mic when clicked again", () => {
      window.SpeechRecognition = mockSpeechRecognition;

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
      expect(mockRecognitionInstance.start).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole("button", { name: /stop voice input/i }));
      expect(mockRecognitionInstance.stop).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
    });

    it("configures the onresult callback during start", () => {
      window.SpeechRecognition = mockSpeechRecognition;

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

      expect(typeof mockRecognitionInstance.onresult).toBe("function");
      expect(typeof mockRecognitionInstance.onend).toBe("function");
      expect(typeof mockRecognitionInstance.onerror).toBe("function");
    });

    it("stops recognition and shows error on onerror callback", async () => {
      window.SpeechRecognition = mockSpeechRecognition;

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
      await act(() => { mockRecognitionInstance.onerror(); });

      expect(mockRecognitionInstance.stop).not.toHaveBeenCalled();
      expect(screen.getByText(/voice input was interrupted/i)).toBeInTheDocument();
    });

    it("stops recognition on onend callback", async () => {
      window.SpeechRecognition = mockSpeechRecognition;

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
      await act(() => { mockRecognitionInstance.onend(); });

      expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
    });

    it("disables mic button when loading", () => {
      window.SpeechRecognition = mockSpeechRecognition;

      mockCallModelBuilder.mockImplementation(() => new Promise(() => {}));
      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build something" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      expect(screen.getByRole("button", { name: /start voice input/i })).toBeDisabled();
    });

    it("cleans up recognition on unmount", () => {
      window.SpeechRecognition = mockSpeechRecognition;

      const { unmount } = render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
      expect(mockRecognitionInstance.start).toHaveBeenCalledOnce();

      unmount();
      expect(mockRecognitionInstance.stop).toHaveBeenCalledOnce();
    });
  });

  it("retries the model builder when validation finds errors, and shows fixed proposal", async () => {
    const handleApply = vi.fn();
    let callCount = 0;
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      callCount++;
      let response;
      if (callCount === 1) {
        // First call: return proposal with a validation error (BATCH size < 2)
        response = {
          intent: "build",
          questions: null,
          explanation: "Built a batch model.",
          proposedModel: {
            entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
            stateVariables: [],
            queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
            bEvents: [{
              id: "arrive",
              name: "Customer Arrival",
              scheduledTime: "0",
              effect: "ARRIVE(Customer, Main Queue)",
              schedules: [{ eventId: "arrive", dist: "Exponential", distParams: { mean: "5" } }],
            }],
            cEvents: [{
              id: "batch",
              name: "Batch",
              priority: 1,
              condition: "queue(Main Queue).length > 0",
              effect: "BATCH(Main Queue, 1)",
              cSchedules: [],
            }],
          },
        };
      } else {
        // Second call: return fixed proposal
        response = {
          intent: "build",
          questions: null,
          explanation: "Fixed batch size to 2.",
          proposedModel: {
            entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
            stateVariables: [],
            queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
            bEvents: [{
              id: "arrive",
              name: "Customer Arrival",
              scheduledTime: "0",
              effect: "ARRIVE(Customer, Main Queue)",
              schedules: [{ eventId: "arrive", dist: "Exponential", distParams: { mean: "5" } }],
            }],
            cEvents: [{
              id: "batch",
              name: "Batch",
              priority: 1,
              condition: "queue(Main Queue).length > 0",
              effect: "BATCH(Main Queue, 2)",
              cSchedules: [],
            }],
          },
        };
      }
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={{
      entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
      stateVariables: [],
      bEvents: [],
      cEvents: [],
      queues: [{ id: "main", name: "Main Queue", discipline: "FIFO" }],
    }} canEdit onApplyModel={handleApply} />);

    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Batch model with 2 entities" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockCallModelBuilder).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/fixed batch size to 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument();
  });

  it("retries up to 3 times on persistent validation errors", async () => {
    let callCount = 0;
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      callCount++;
      // Return a model with no ARRIVE or COMPLETE (triggers V8) on every call
      const response = {
        intent: "build",
        questions: null,
        explanation: `Attempt ${callCount}`,
        proposedModel: {
          entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
          stateVariables: [], bEvents: [], cEvents: [], queues: [],
        },
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "broken model" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    // 1 initial call + 3 retries = 4 total calls maximum
    await waitFor(() => expect(mockCallModelBuilder).toHaveBeenCalledTimes(4), { timeout: 5000 });
    expect(screen.getByText(/still has.*issue/i)).toBeInTheDocument();
  });

  it("shows 'Based on template' note when intent is template", async () => {
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
        intent: "template",
        templateId: "call-center",
        questions: null,
        flowDescription: "Callers arrive, wait, are served by agents.",
        explanation: "Adapted the Call Center template.",
        proposedModel: {
          ...model,
          entityTypes: [
            { id: "caller", name: "Caller", role: "customer", attrDefs: [] },
            { id: "agent",  name: "Agent",  role: "server", count: 3, attrDefs: [] },
          ],
        },
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A call centre with 3 agents" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/based on template.*call-center/i)).toBeInTheDocument());
  });

  describe("F8C.2 — confirmation step", () => {
    it("renders a styled confirmation bubble when intent is confirm", async () => {
      const confirmResponse = {
        intent: "confirm",
        questions: null,
        explanation: "I will build a post office with 2 clerks and a single queue.",
        proposedModel: null,
      };
      mockCallModelBuilder.mockResolvedValue(confirmResponse);

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A post office" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());
      expect(screen.getByText(/I will build a post office/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /looks right.*build it/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /something.s wrong/i })).toBeInTheDocument();
    });

    it("auto-sends yes when Looks right — build it is clicked", async () => {
      let callCount = 0;
      mockCallModelBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ intent: "confirm", explanation: "Ready to build a clinic.", proposedModel: null });
        }
        return Promise.resolve({
          intent: "build",
          explanation: "Built the clinic.",
          proposedModel: { ...model },
        });
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A clinic" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /looks right.*build it/i }));

      await waitFor(() => expect(mockCallModelBuilder).toHaveBeenCalledTimes(2));
      expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument();
    });

    it("clears confirmation and updates placeholder when Something's wrong is clicked", async () => {
      mockCallModelBuilder.mockResolvedValue({ intent: "confirm", explanation: "Ready to build.", proposedModel: null });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "A model" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /something.s wrong/i }));

      expect(screen.queryByLabelText(/model confirmation/i)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/describe what.s wrong/i)).toBeInTheDocument();
    });
  });

  describe("F8C.4 — proactive refinement chips", () => {
    it("renders refinement chips after a build response with suggestions", async () => {
      mockCallModelBuilder.mockResolvedValue({
        intent: "build",
        explanation: "Built a model.",
        proposedModel: { ...model },
        suggestions: ["Add a second clerk", "Enable reneging after 30 min"],
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build it" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByText(/Add a second clerk/i)).toBeInTheDocument());
      expect(screen.getByText(/Enable reneging after 30 min/i)).toBeInTheDocument();
    });

    it("submits chip text and triggers a second call when a chip is clicked", async () => {
      // Model with an ARRIVE event avoids the V8 hard-error retry loop (no bEvents = error, one ARRIVE = warning only)
      const proposedWithArrival = {
        ...model,
        bEvents: [{ id: "arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Customer, Queue1)", schedules: [] }],
      };
      let callCount = 0;
      mockCallModelBuilder.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          intent: "build",
          explanation: callCount === 1 ? "Initial model." : "Added second clerk.",
          proposedModel: proposedWithArrival,
          suggestions: callCount === 1 ? ["Add a second clerk"] : [],
        });
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build it" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByText(/Add a second clerk/i)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Add a second clerk/i));

      await waitFor(() => expect(mockCallModelBuilder).toHaveBeenCalledTimes(2));
    });

    it("clears chips after manual user send", async () => {
      mockCallModelBuilder.mockResolvedValue({
        intent: "build",
        explanation: "Built a model.",
        proposedModel: { ...model },
        suggestions: ["Add a second clerk"],
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build it" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByText(/Add a second clerk/i)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Something else" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.queryByText(/Add a second clerk/i)).not.toBeInTheDocument());
    });

    it("renders no chips after a clarify response", async () => {
      mockCallModelBuilder.mockResolvedValue({
        intent: "clarify",
        questions: ["How many servers do you need?"],
        proposedModel: null,
        suggestions: [],
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build something" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByText(/How many servers/i)).toBeInTheDocument());
      expect(screen.queryByText(/Add a second/i)).not.toBeInTheDocument();
    });

    it("renders no chips after a confirm response", async () => {
      mockCallModelBuilder.mockResolvedValue({
        intent: "confirm",
        explanation: "I will build a post office.",
        proposedModel: null,
        suggestions: ["Add a second clerk"],
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build it" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());
      expect(screen.queryByText(/Add a second clerk/i)).not.toBeInTheDocument();
    });

    it("renders a single chip when suggestions array has 1 item", async () => {
      mockCallModelBuilder.mockResolvedValue({
        intent: "build",
        explanation: "Built a model.",
        proposedModel: { ...model },
        suggestions: ["Only one suggestion"],
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => expect(screen.getByText(/Only one suggestion/i)).toBeInTheDocument());
      expect(screen.getAllByRole("button").filter(b => b.textContent === "Only one suggestion")).toHaveLength(1);
    });

    it("renders nothing when suggestions array is empty", async () => {
      mockCallModelBuilder.mockResolvedValue({
        intent: "build",
        explanation: "Built a model.",
        proposedModel: { ...model },
        suggestions: [],
      });

      render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Build" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await screen.findByLabelText(/model proposal preview/i);
      const chipPattern = /^Add |^Enable |^Try /;
      expect(screen.queryAllByRole("button").filter(b => chipPattern.test(b.textContent))).toHaveLength(0);
    });
  });

  it("normalizes Schedule distribution distParams preserving times array and jitterParams", async () => {
    const handleApply = vi.fn();
    mockCallModelBuilder.mockImplementation((systemPrompt, messages, onComplete) => {
      const response = {
        intent: "build",
        questions: null,
        explanation: "Built a scheduled model.",
        proposedModel: {
          entityTypes: [{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }],
          stateVariables: [],
          bEvents: [{
            id: "arr", name: "Arrive", scheduledTime: "0", effect: "ARRIVE(Customer, Queue)",
            schedules: [{
              eventId: "arr",
              dist: "Schedule",
              distParams: { times: [10, 20, 30], jitterDist: "Normal", jitterParams: { stddev: "3" } },
            }],
          }],
          cEvents: [],
          queues: [{ id: "q", name: "Queue", customerType: "Customer", discipline: "FIFO" }],
        },
      };
      onComplete(response);
      return response;
    });

    render(<AiGeneratedModelPanel model={model} canEdit onApplyModel={handleApply} />);
    fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: "Scheduled arrivals" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByLabelText(/model proposal preview/i);
    fireEvent.click(screen.getByRole("button", { name: /apply model/i }));

    const applied = handleApply.mock.calls[0][0];
    const sched = applied.bEvents[0].schedules[0];
    expect(sched.dist).toBe("Schedule");
    expect(Array.isArray(sched.distParams.times)).toBe(true);
    expect(sched.distParams.times).toEqual([10, 20, 30]);
    expect(sched.distParams.jitterParams).toEqual({ stddev: "3" });
  });
});
