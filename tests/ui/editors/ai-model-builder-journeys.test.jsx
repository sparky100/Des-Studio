// Multi-turn conversation JOURNEY tests for the AI Model Builder — the whole
// pipeline runs real: real AiGeneratedModelPanel, real apiClient parsing, real
// validateModel. The ONLY mock is global fetch (scripted raw LLM responses via
// tests/__helpers__/llmFetchHarness.js).
//
// These exist because the 2026-08-29 "stuck assistant" bug (PR #501) lived in
// the seam every other test mocked away: raw LLM text → parser → panel state,
// compounding across turns. Unit tests on both sides were green; the journey
// was broken. Each test here scripts a full conversation and asserts
// end-state invariants:
//   - the user is never left unable to send (errors don't wedge the loop)
//   - every assistant turn replayed to the LLM is the strict JSON envelope
//   - fetch budgets match the documented retry paths (over-fetching throws)
//
// Real timers throughout: fetches resolve instantly, so apiClient's 60s abort
// timers are always cleared before firing; fake timers would fight waitFor.
// NOTE: no vi.mock of src/llm/apiClient.js anywhere in this file — that is the
// point — and no vi.restoreAllMocks (it would strip the global supabase mock).
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiGeneratedModelPanel } from "../../../src/ui/editors/AiGeneratedModelPanel.jsx";
import { installLlmFetchMock, envelope, expectLlmTurnsEnveloped } from "../../__helpers__/llmFetchHarness.js";
import {
  MINIMAL_VALID_PROPOSED_MODEL,
  SINKLESS_INVALID_PROPOSED_MODEL,
  INCIDENT_PROSE_CLARIFY_248,
} from "../../__helpers__/llmModelBuilderResponses.js";

// Content-free, description-free host model: no auto "initial understanding"
// history turn is created on mount, so every assistant turn in the replayed
// history is LLM-originated and the envelope invariant can be asserted strictly.
const emptyModel = { entityTypes: [], stateVariables: [], bEvents: [], cEvents: [], queues: [] };

function renderPanel() {
  return render(<AiGeneratedModelPanel model={emptyModel} canEdit onApplyModel={() => {}} />);
}

function sendMessage(text) {
  fireEvent.change(screen.getByLabelText(/describe or refine/i), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
}

describe("AI Model Builder conversation journeys (real parser, fetch-only mock)", () => {
  it("completes describe → clarify → answer → confirm → build with every replayed assistant turn enveloped", async () => {
    const { fetchMock, calls } = installLlmFetchMock([
      envelope({ intent: "clarify", questions: "How many clerks serve the counter?" }),
      envelope({ intent: "confirm", summary: "A post office with one queue and 2 clerks." }),
      envelope({ intent: "build", explanation: "Built the post office.", proposedModel: MINIMAL_VALID_PROPOSED_MODEL }),
    ]);
    renderPanel();

    sendMessage("A post office with a single queue");
    await waitFor(() => expect(screen.getByText(/How many clerks serve the counter/i)).toBeInTheDocument());

    sendMessage("2 clerks, exponential arrivals every 5 minutes");
    await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /looks right.*build it/i }));
    await waitFor(() => expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Wire-contract invariant: the 2nd and 3rd requests replay prior assistant
    // turns — each must be the strict JSON envelope, never bare prose.
    expect(expectLlmTurnsEnveloped(calls[1].body.messages)).toBeGreaterThanOrEqual(1);
    expect(expectLlmTurnsEnveloped(calls[2].body.messages)).toBeGreaterThanOrEqual(1);
  });

  it("recovers from prose drift (the reported incident): a plain-text clarifying question renders as chat, is replayed enveloped, and the conversation still completes", async () => {
    const { fetchMock, calls } = installLlmFetchMock([
      envelope({ intent: "clarify", questions: "What kinds of customers visit the shop?" }),
      INCIDENT_PROSE_CLARIFY_248, // the model drifts into markdown prose — no JSON anywhere
      envelope({ intent: "confirm", summary: "A bike shop with hire and repair customers." }),
      envelope({ intent: "build", explanation: "Built the bike shop.", proposedModel: MINIMAL_VALID_PROPOSED_MODEL }),
    ]);
    renderPanel();

    sendMessage("A bike hire and repair shop");
    await waitFor(() => expect(screen.getByText(/What kinds of customers visit/i)).toBeInTheDocument());

    sendMessage("Hire customers and repair customers");
    // The prose reply must surface as a normal clarifying chat bubble — the
    // pre-#501 behavior was a misleading "invalid model JSON" error here.
    await waitFor(() => expect(screen.getByText(/do they wait in the shop/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    sendMessage("They drop the bike off and come back later");
    await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());

    // The third request's history must replay the drifted prose turn re-wrapped
    // as the strict envelope — this is what stops the drift self-reinforcing.
    const thirdRequestAssistantTurns = calls[2].body.messages.filter(m => m.role === "assistant");
    expect(expectLlmTurnsEnveloped(calls[2].body.messages)).toBe(thirdRequestAssistantTurns.length);
    const replayedProse = thirdRequestAssistantTurns.find(m => m.content.includes("wait in the shop"));
    expect(replayedProse).toBeDefined();
    expect(JSON.parse(replayedProse.content)).toEqual(expect.objectContaining({ intent: "clarify" }));

    fireEvent.click(screen.getByRole("button", { name: /looks right.*build it/i }));
    await waitFor(() => expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not wedge the loop on genuinely truncated JSON: error is shown with the raw response, and the next send still works", async () => {
    const truncated = '{"intent":"build","explanation":"A post office model with';
    const { fetchMock } = installLlmFetchMock([
      truncated, truncated, // streamModelBuilder's internal retry consumes both
      envelope({ intent: "clarify", questions: "Could you describe the system again, more briefly?" }),
    ]);
    renderPanel();

    sendMessage("Build the whole hospital");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/incomplete or invalid model JSON/i);
    expect(screen.getByText(/show raw ai response/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The invariant the incident violated: the user must still be able to continue.
    // (The send button is disabled while the draft is empty by design, so the
    // proof is the input staying enabled and a follow-up send actually working.)
    expect(screen.getByLabelText(/describe or refine/i)).not.toBeDisabled();
    sendMessage("Just the triage desk then");
    await waitFor(() => expect(screen.getByText(/describe the system again/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers a build turn that arrived without a model via the missing-proposedModel retry loop", async () => {
    const { fetchMock } = installLlmFetchMock([
      envelope({ intent: "confirm", summary: "A post office with one clerk." }),
      envelope({ intent: "build", explanation: "Built it.", proposedModel: null }),
      envelope({ intent: "build", explanation: "Built it properly.", proposedModel: MINIMAL_VALID_PROPOSED_MODEL }),
    ]);
    renderPanel();

    sendMessage("A post office with one clerk");
    await waitFor(() => expect(screen.getByLabelText(/model confirmation/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /looks right.*build it/i }));
    await waitFor(() => expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument());

    expect(screen.getByText(/asking it to try again/i)).toBeInTheDocument();
    expect(screen.getByText(/model built/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("repairs an invalid proposal via the validation-error retry loop", async () => {
    const { fetchMock } = installLlmFetchMock([
      envelope({ intent: "build", explanation: "Built a draft.", proposedModel: SINKLESS_INVALID_PROPOSED_MODEL }),
      envelope({ intent: "build", explanation: "Fixed the draft.", proposedModel: MINIMAL_VALID_PROPOSED_MODEL }),
    ]);
    renderPanel();

    sendMessage("A queue where customers arrive every 5 minutes and one clerk serves them for 7.5");
    await waitFor(() => expect(screen.getByLabelText(/model proposal preview/i)).toBeInTheDocument());

    expect(screen.getByText(/draft has \d+ issue/i)).toBeInTheDocument();
    // The corrected proposal must NOT carry the "still has issues" notice.
    expect(screen.queryByText(/still has \d+ model issue/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces an empty response as its own error and stays recoverable", async () => {
    const { fetchMock } = installLlmFetchMock([
      "", "", // stream retry consumes both
      envelope({ intent: "clarify", questions: "What would you like to build?" }),
    ]);
    renderPanel();

    sendMessage("Hello?");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/empty response/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    sendMessage("A small coffee kiosk");
    await waitFor(() => expect(screen.getByText(/what would you like to build/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
