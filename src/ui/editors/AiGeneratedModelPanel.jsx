import { useMemo, useState } from "react";
import { callModelBuilder } from "../../llm/apiClient.js";
import { buildModelBuilderSystemPrompt, buildModelBuilderUserMessage } from "../../llm/model-builder-prompts.js";
import { C, FONT } from "../shared/tokens.js";
import { Btn, Empty, Field, InfoBox, SH } from "../shared/components.jsx";
import { ModelDiffPreview } from "./ModelDiffPreview.jsx";

function unwrapProposedModel(proposedModel = {}) {
  const source = proposedModel.model_json || proposedModel.modelJson || proposedModel.model || proposedModel;
  return {
    ...(proposedModel.name ? { name: proposedModel.name } : {}),
    ...(proposedModel.description ? { description: proposedModel.description } : {}),
    entityTypes: Array.isArray(source.entityTypes) ? source.entityTypes : [],
    stateVariables: Array.isArray(source.stateVariables) ? source.stateVariables : [],
    bEvents: Array.isArray(source.bEvents) ? source.bEvents : [],
    cEvents: Array.isArray(source.cEvents) ? source.cEvents : [],
    queues: Array.isArray(source.queues) ? source.queues : [],
  };
}

function Bubble({ role, content }) {
  const isUser = role === "user";
  const isSystem = role === "system";
  return (
    <div style={{
      alignSelf: isSystem ? "center" : isUser ? "flex-end" : "flex-start",
      maxWidth: isSystem ? "80%" : "72%",
      background: isSystem ? C.surface : isUser ? C.accent + "22" : C.bg,
      border: `1px solid ${isUser ? C.accent : C.border}`,
      borderRadius: 8,
      padding: "9px 11px",
      color: C.text,
      fontFamily: FONT,
      fontSize: 12,
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
    }}>
      {content}
    </div>
  );
}

export function AiGeneratedModelPanel({ model, canEdit, onApplyModel }) {
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const systemPrompt = useMemo(() => buildModelBuilderSystemPrompt(), []);

  const send = async () => {
    const text = draft.trim();
    if (!text || loading || !canEdit) return;
    const nextHistory = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
    setDraft("");
    setError("");
    setNotice("");
    setLoading(true);

    const messages = [
      ...nextHistory.slice(-10),
      {
        role: "user",
        content: buildModelBuilderUserMessage(text, model, nextHistory),
      },
    ];

    if (nextHistory.filter(turn => turn.role === "assistant").length >= 10) {
      messages.push({ role: "user", content: "Please now produce a model proposal based on the discussion so far." });
    }

    await callModelBuilder(systemPrompt, messages, response => {
      const questions = Array.isArray(response.questions) ? response.questions.filter(Boolean) : [];
      const content = response.intent === "clarify"
        ? questions.join("\n")
        : response.explanation || "Model proposal received.";
      setHistory(prev => [...prev, { role: "assistant", content }]);
      if (response.proposedModel) setProposal(unwrapProposedModel(response.proposedModel));
      if (nextHistory.length >= 20) setNotice("Conversation is long - consider starting a new session.");
    }, err => {
      setError(err?.message || "Model builder request failed.");
    });
    setLoading(false);
  };

  const applyProposal = (nextModel, validation = { errors: [], warnings: [] }) => {
    onApplyModel?.(nextModel);
    setProposal(null);
    const errorText = validation.errors?.length
      ? `Proposal applied as an editable draft with ${validation.errors.length} validation issue(s). Fix them in the tabs before running.`
      : "";
    const warningText = validation.warnings?.length ? validation.warnings.map(w => `[${w.code}] ${w.message}`).join("\n") : "";
    setNotice(errorText || warningText || "Proposal applied. Save the model when ready.");
    setHistory(prev => [...prev, { role: "system", content: errorText || "Proposal applied to the editable model." }]);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: proposal ? "minmax(320px, 1fr) minmax(360px, 0.95fr)" : "minmax(320px, 760px)", gap: 16, alignItems: "stretch" }}>
      <section aria-label="AI Generated Model conversation" style={{ display: "flex", flexDirection: "column", minHeight: 520, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
          <SH label="AI Generated Model" />
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, marginTop: 4 }}>
            Natural-language authoring over the same validated model JSON.
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: 14, overflowY: "auto" }}>
          {!history.length && (
            <Empty icon="AI" msg="Describe the system you want to model, or ask for a refinement to the current model." />
          )}
          {history.map((turn, index) => <Bubble key={index} role={turn.role} content={turn.content} />)}
          {notice && <Bubble role="system" content={notice} />}
          {error && <div role="alert"><InfoBox color={C.red}>{error}</InfoBox></div>}
        </div>
        <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <Field
            label="Describe or refine"
            value={draft}
            onChange={setDraft}
            multiline
            rows={3}
            placeholder="e.g. A post office with 2 clerks, FIFO queue, exponential arrivals at rate 0.5"
          />
          <Btn variant="primary" onClick={send} disabled={!draft.trim() || loading || !canEdit}>{loading ? "Sending..." : "Send"}</Btn>
        </div>
      </section>

      {proposal && (
        <ModelDiffPreview
          currentModel={model}
          proposedModel={proposal}
          onApply={applyProposal}
          onDiscard={() => setProposal(null)}
          allowDraftApply
        />
      )}
    </div>
  );
}
