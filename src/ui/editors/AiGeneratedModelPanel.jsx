import { useMemo, useState } from "react";
import { callModelBuilder } from "../../llm/apiClient.js";
import { buildModelBuilderSystemPrompt, buildModelBuilderUserMessage } from "../../llm/model-builder-prompts.js";
import { C, FONT } from "../shared/tokens.js";
import { Btn, Empty, Field, InfoBox, SH } from "../shared/components.jsx";
import { ModelDiffPreview } from "./ModelDiffPreview.jsx";

const DIST_NAMES = {
  fixed: "Fixed",
  uniform: "Uniform",
  exponential: "Exponential",
  normal: "Normal",
  triangular: "Triangular",
  erlang: "Erlang",
  empirical: "Empirical",
  piecewise: "Piecewise",
  serverattr: "ServerAttr",
  "server-attr": "ServerAttr",
  server_attr: "ServerAttr",
};

function unwrapProposedModel(proposedModel = {}) {
  const source = proposedModel.model_json || proposedModel.modelJson || proposedModel.model || proposedModel;
  const normalizeEntityType = entityType => ({
    ...entityType,
    attrDefs: Array.isArray(entityType.attrDefs)
      ? entityType.attrDefs.map(normalizeAttrDef)
      : [],
  });
  const normalizeBEvent = event => ({
    ...event,
    name: cleanGeneratedName(event.name),
    scheduledTime: normalizeBEventScheduledTime(event),
    effect: normalizeEffect(event.effect ?? event.effects ?? event.action ?? event.actions),
    schedules: Array.isArray(event.schedules) ? event.schedules.map(normalizeSchedule) : [],
  });
  const normalizeCEvent = event => {
    const effect = normalizeEffect(event.effect ?? event.effects ?? event.action ?? event.actions);
    return {
      ...event,
      effect,
      condition: normalizeCEventCondition(event.condition, effect),
      cSchedules: Array.isArray(event.cSchedules)
      ? event.cSchedules.map(normalizeSchedule)
      : Array.isArray(event.schedules)
        ? event.schedules.map(normalizeSchedule)
        : [],
    };
  };
  return {
    ...(proposedModel.name ? { name: proposedModel.name } : {}),
    ...(proposedModel.description ? { description: proposedModel.description } : {}),
    entityTypes: Array.isArray(source.entityTypes) ? source.entityTypes.map(normalizeEntityType) : [],
    stateVariables: Array.isArray(source.stateVariables) ? source.stateVariables : [],
    bEvents: Array.isArray(source.bEvents) ? source.bEvents.map(normalizeBEvent) : [],
    cEvents: Array.isArray(source.cEvents) ? source.cEvents.map(normalizeCEvent) : [],
    queues: Array.isArray(source.queues) ? source.queues : [],
  };
}

function cleanGeneratedName(name = "") {
  return String(name || "").replace(/\s*\((template|tmpl)\)\s*/gi, "").trim();
}

function macroCallFromObject(action = {}) {
  const macro = String(action.macro || action.type || action.name || "").trim().toUpperCase();
  if (!macro) return "";
  if (typeof action.effect === "string") return action.effect;
  const args = Array.isArray(action.args)
    ? action.args
    : [action.entityType || action.customerType || action.queue || action.resourceType || action.serverType, action.serverType || action.resourceType]
        .filter(Boolean);
  return `${macro}(${args.join(", ")})`;
}

function normalizeEffect(effect) {
  if (Array.isArray(effect)) {
    return effect
      .map(item => typeof item === "string" ? item : macroCallFromObject(item))
      .filter(Boolean);
  }
  if (effect && typeof effect === "object") return macroCallFromObject(effect);
  return effect || "";
}

function effectText(effect) {
  return Array.isArray(effect) ? effect.filter(Boolean).join(";") : String(effect || "");
}

function normalizeBEventScheduledTime(event = {}) {
  const text = effectText(normalizeEffect(event.effect ?? event.effects ?? event.action ?? event.actions));
  if (/\bCOMPLETE\(/i.test(text) || /\bRENEGE\(/i.test(text)) return "9999";
  if (event.scheduledTime != null) return String(event.scheduledTime);
  if (event.time != null) return String(event.time);
  return /\bARRIVE\(/i.test(text) ? "0" : "9999";
}

function normalizeDistName(dist) {
  if (!dist) return "Fixed";
  const text = String(dist).trim();
  return DIST_NAMES[text.toLowerCase()] || text;
}

function numericString(value) {
  if (value == null || value === "") return "";
  return String(value);
}

function normalizeDistribution(input = {}, fallback = { dist: "Fixed", distParams: { value: "0" } }) {
  const raw = input.distribution || input.delayDistribution || input.durationDistribution || input.serviceDistribution || input;
  const dist = normalizeDistName(raw.dist || raw.type || input.dist || input.type || fallback.dist);
  const params = {
    ...(raw.distParams || raw.params || raw.parameters || input.distParams || input.params || input.parameters || {}),
  };

  for (const key of ["value", "mean", "min", "max", "mode", "stddev", "stdDev", "k", "attr", "values"]) {
    if (params[key] == null && raw[key] != null) params[key] = raw[key];
    if (params[key] == null && input[key] != null) params[key] = input[key];
  }
  if (fallback.dist === dist) {
    for (const [key, value] of Object.entries(fallback.distParams || {})) {
      if (params[key] == null) params[key] = value;
    }
  }
  if (params.stddev == null && params.stdDev != null) params.stddev = params.stdDev;
  delete params.stdDev;

  const rate = params.rate ?? raw.rate ?? input.rate;
  if (dist === "Exponential" && params.mean == null && rate != null) {
    const n = Number(rate);
    params.mean = Number.isFinite(n) && n > 0 ? String(1 / n) : "";
  }
  delete params.rate;

  if (dist === "Fixed" && params.value == null && input.defaultValue != null) {
    params.value = input.defaultValue;
  }

  for (const key of Object.keys(params)) {
    if (key !== "values" && key !== "periods") params[key] = numericString(params[key]);
  }

  return { dist, distParams: params };
}

function normalizeAttrDef(attr = {}) {
  const hasDistribution = attr.dist || attr.type || attr.distribution || attr.distParams || attr.params;
  const fallbackValue = attr.defaultValue ?? attr.value ?? "0";
  const normalized = hasDistribution || attr.defaultValue != null || attr.value != null
    ? normalizeDistribution(attr, { dist: "Fixed", distParams: { value: numericString(fallbackValue) } })
    : { dist: attr.dist || "Fixed", distParams: attr.distParams || { value: "0" } };
  return {
    ...attr,
    valueType: attr.valueType || "number",
    dist: normalized.dist,
    distParams: normalized.distParams,
  };
}

function normalizeSchedule(schedule = {}) {
  const normalized = normalizeDistribution(schedule, { dist: "Exponential", distParams: { mean: "1" } });
  return {
    ...schedule,
    eventId: schedule.eventId || schedule.bEventId || schedule.targetEventId || schedule.target || "",
    dist: normalized.dist,
    distParams: normalized.distParams,
  };
}

function assignParts(effect) {
  const match = effectText(effect).match(/ASSIGN\(([^,]+)\s*,\s*([^)]+)\)/i);
  return match ? { queueOrCustomer: match[1].trim(), server: match[2].trim() } : null;
}

function normalizeCEventCondition(condition, effect) {
  const text = conditionToLegacyString(condition);
  const parts = assignParts(effect);
  if (!parts) return text;

  const hasQueue = /queue\([^)]+\)\.length\s*(?:>|>=|!=)/i.test(text);
  const hasIdle = /idle\([^)]+\)\.count\s*(?:>|>=|!=)/i.test(text);
  const queueClause = `queue(${parts.queueOrCustomer}).length > 0`;
  const idleClause = `idle(${parts.server}).count > 0`;

  if (hasQueue && hasIdle) return text;
  if (hasQueue) return `${text} AND ${idleClause}`;
  if (hasIdle) return `${queueClause} AND ${text}`;
  return `${queueClause} AND ${idleClause}`;
}

function formatConditionValue(value) {
  if (typeof value === "string" && /\s/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
  return String(value ?? "");
}

function predicateVariableToToken(variable = "") {
  const text = String(variable || "").trim();
  const queueMatch = text.match(/^Queue\.([^.]+)\.(length|count|size)$/i);
  if (queueMatch) return `queue(${queueMatch[1]}).length`;
  const idleMatch = text.match(/^Resource\.([^.]+)\.(idle|idleCount|available|availableCount)$/i);
  if (idleMatch) return `idle(${idleMatch[1]}).count`;
  const busyMatch = text.match(/^Resource\.([^.]+)\.(busy|busyCount)$/i);
  if (busyMatch) return `busy(${busyMatch[1]}).count`;
  return text;
}

function conditionToLegacyString(condition) {
  if (!condition) return "";
  if (typeof condition === "string") return condition;
  if (typeof condition !== "object" || Array.isArray(condition)) return "";

  const op = String(condition.operator || "AND").toUpperCase();
  if ((op === "AND" || op === "OR") && Array.isArray(condition.clauses)) {
    return condition.clauses
      .map(conditionToLegacyString)
      .filter(Boolean)
      .join(` ${op} `);
  }

  const variable = predicateVariableToToken(condition.variable || condition.token || condition.left);
  const operator = condition.operator || "==";
  if (!variable || !operator) return "";
  return `${variable} ${operator} ${formatConditionValue(condition.value ?? condition.right)}`;
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

export function AiGeneratedModelPanel({ model, canEdit, onApplyModel, onSaveModel }) {
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
  const saveProposal = async (nextModel, validation = { errors: [], warnings: [] }) => {
    await onSaveModel?.(nextModel);
    setProposal(null);
    const errorText = validation.errors?.length
      ? `Proposal saved as an editable draft with ${validation.errors.length} validation issue(s). Fix them in the tabs before running.`
      : "";
    const warningText = validation.warnings?.length ? validation.warnings.map(w => `[${w.code}] ${w.message}`).join("\n") : "";
    setNotice(errorText || warningText || "Proposal applied and saved.");
    setHistory(prev => [...prev, { role: "system", content: errorText || "Proposal applied and saved." }]);
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
          onApplyAndSave={saveProposal}
          onDiscard={() => setProposal(null)}
          allowDraftApply
        />
      )}
    </div>
  );
}
