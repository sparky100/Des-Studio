import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callModelBuilder } from "../../llm/apiClient.js";
import { buildModelBuilderSystemPrompt, buildModelBuilderUserMessage } from "../../llm/model-builder-prompts.js";
import { C, FONT } from "../shared/tokens.js";
import { Btn, Empty, Field, InfoBox, SH } from "../shared/components.jsx";
import { ModelDiffPreview } from "./ModelDiffPreview.jsx";
import { validateModel } from "../../engine/validation.js";
import { predicateToLegacyString, rowsToPredicate, parseConditionString } from "../../model/conditionFormat.js";

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
  schedule: "Schedule",
  plan: "Schedule",
};

function unwrapProposedModel(proposedModel = {}) {
  const source = proposedModel.model_json || proposedModel.modelJson || proposedModel.model || proposedModel;
  const normalizeEntityType = entityType => ({
    ...entityType,
    attrDefs: Array.isArray(entityType.attrDefs)
      ? entityType.attrDefs.map(normalizeAttrDef)
      : [],
  });
  const queues = Array.isArray(source.queues) ? source.queues : [];
  const entityTypes = Array.isArray(source.entityTypes) ? source.entityTypes.map(normalizeEntityType) : [];
  const normalizeBEvent = event => {
    const effect = normalizeBEventEffect(event, entityTypes, queues);
    const schedules = Array.isArray(event.schedules)
      ? event.schedules.map(schedule => normalizeSchedule(schedule, /\bARRIVE\(/i.test(effectText(effect)) ? event.id : ""))
      : [];
    return {
      ...event,
      name: cleanGeneratedName(event.name),
      scheduledTime: normalizeBEventScheduledTime({ ...event, effect }),
      effect,
      schedules,
    };
  };
  const bEvents = Array.isArray(source.bEvents) ? source.bEvents.map(normalizeBEvent) : [];
  const normalizeCEvent = event => {
    const effect = normalizeCEventEffect(event, queues);
    const cSchedules = Array.isArray(event.cSchedules)
      ? event.cSchedules.map(normalizeCEventSchedule)
      : Array.isArray(event.schedules)
        ? event.schedules.map(normalizeCEventSchedule)
        : [];
    const nextSchedules = ensureCompletionEventEffects(cSchedules, bEvents);
    return {
      ...event,
      effect,
      condition: normalizeCEventCondition(event.condition, effect),
      cSchedules: nextSchedules,
    };
  };
  return {
    ...(proposedModel.name ? { name: proposedModel.name } : {}),
    ...(proposedModel.description ? { description: proposedModel.description } : {}),
    entityTypes,
    stateVariables: Array.isArray(source.stateVariables) ? source.stateVariables : [],
    bEvents,
    cEvents: Array.isArray(source.cEvents) ? source.cEvents.map(normalizeCEvent) : [],
    queues,
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

function firstCustomerType(entityTypes = []) {
  return entityTypes.find(type => type.role === "customer")?.name || entityTypes[0]?.name || "Customer";
}

function firstQueueForCustomer(queues = [], customerType = "") {
  return queues.find(queue => queue.customerType && queue.customerType === customerType)?.name
    || queues[0]?.name
    || "";
}

function eventLooksLikeArrival(event = {}) {
  const text = `${event.name || ""} ${event.kind || ""} ${event.type || ""}`.toLowerCase();
  return /arriv|inter-?arrival|arrival pattern/.test(text)
    || (Array.isArray(event.schedules) && event.schedules.length > 0 && String(event.scheduledTime ?? event.time ?? "0") === "0");
}

function normalizeBEventEffect(event = {}, entityTypes = [], queues = []) {
  const effect = normalizeEffect(event.effect ?? event.effects ?? event.action ?? event.actions);
  if (effectText(effect).trim()) return effect;

  const customer = event.customerType || event.entityType || firstCustomerType(entityTypes);
  const queue = event.queue || event.queueName || event.targetQueue || firstQueueForCustomer(queues, customer);
  if (eventLooksLikeArrival(event)) return queue ? `ARRIVE(${customer}, ${queue})` : `ARRIVE(${customer})`;

  const name = String(event.name || "").toLowerCase();
  if (/complete|finish|depart|sink/.test(name)) return "COMPLETE()";
  return effect;
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
    if (key !== "values" && key !== "periods" && key !== "times" && key !== "jitterParams") {
      params[key] = numericString(params[key]);
    }
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

function normalizeSchedule(schedule = {}, fallbackEventId = "") {
  const normalized = normalizeDistribution(schedule, { dist: "Exponential", distParams: { mean: "1" } });
  return {
    ...schedule,
    eventId: schedule.eventId || schedule.bEventId || schedule.targetEventId || schedule.target || fallbackEventId,
    dist: normalized.dist,
    distParams: normalized.distParams,
  };
}

function normalizeCEventSchedule(schedule = {}) {
  return {
    ...normalizeSchedule(schedule),
    useEntityCtx: schedule.useEntityCtx !== false,
  };
}

function assignParts(effect) {
  const match = effectText(effect).match(/ASSIGN\(([^,]+)\s*,\s*([^)]+)\)/i);
  return match ? { queueOrCustomer: match[1].trim(), server: match[2].trim() } : null;
}

function servicePartsFromCondition(condition) {
  const text = conditionToLegacyString(condition);
  const queue = text.match(/queue\(([^)]+)\)\.length/i)?.[1]?.trim();
  const server = text.match(/idle\(([^)]+)\)\.count/i)?.[1]?.trim();
  return queue && server ? { queueOrCustomer: queue, server } : null;
}

function normalizeCEventEffect(event = {}, queues = []) {
  const effect = normalizeEffect(event.effect ?? event.effects ?? event.action ?? event.actions);
  if (effectText(effect).trim()) return effect;

  const fromCondition = servicePartsFromCondition(event.condition);
  if (fromCondition) return `ASSIGN(${fromCondition.queueOrCustomer}, ${fromCondition.server})`;

  const queueName = event.queue || event.queueName || event.sourceQueue || queues[0]?.name;
  const server = event.server || event.serverType || event.resource || event.resourceType;
  if (queueName && server) return `ASSIGN(${queueName}, ${server})`;
  return effect;
}

function ensureCompletionEventEffects(cSchedules = [], bEvents = []) {
  cSchedules.forEach(schedule => {
    if (!schedule.eventId) return;
    const event = bEvents.find(candidate => candidate.id === schedule.eventId);
    if (!event || effectText(event.effect).trim()) return;
    event.effect = "COMPLETE()";
    event.scheduledTime = "9999";
    event.name = cleanGeneratedName(event.name || "Service Complete");
  });
  return cSchedules;
}

function normalizeCEventCondition(condition, effect) {
  const text = conditionToLegacyString(condition);
  const parts = assignParts(effect);
  if (!parts) return typeof condition === "string" ? rowsToPredicate(parseConditionString(text)) : condition;

  const hasQueue = /queue\([^)]+\)\.length\s*(?:>|>=|!=)/i.test(text);
  const hasIdle = /idle\([^)]+\)\.count\s*(?:>|>=|!=)/i.test(text);
  const queueClause = `queue(${parts.queueOrCustomer}).length > 0`;
  const idleClause = `idle(${parts.server}).count > 0`;

  const nextText = hasQueue && hasIdle
    ? text
    : hasQueue
      ? `${text} AND ${idleClause}`
      : hasIdle
        ? `${queueClause} AND ${text}`
        : `${queueClause} AND ${idleClause}`;

  return rowsToPredicate(parseConditionString(nextText));
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
  return predicateToLegacyString(condition);
}

function stripTrailingQuestion(text = "") {
  return String(text).replace(/[.!]?\s*[\w\s,'-]+(Does this|Is this|Sound right|Shall I|Should I|Would you like|Does that|Can I|May I)[^?]*\?+\s*$/i, "").trim();
}

function Bubble({ role, content }) {
  const isUser = role === "user";
  const isSystem = role === "system";
  const label = isSystem ? "Model note" : isUser ? "You" : "Assistant";
  return (
    <div style={{
      alignSelf: isSystem ? "center" : isUser ? "flex-end" : "flex-start",
      maxWidth: isSystem ? "80%" : "72%",
      background: isSystem ? C.surface : isUser ? C.accent + "22" : C.bg,
      border: `1px solid ${isUser ? C.accent : C.border}`,
      borderRadius: 8,
      padding: "10px 12px",
      color: C.text,
      fontFamily: FONT,
      fontSize: 11,
      lineHeight: 1.7,
      whiteSpace: "pre-wrap",
    }}>
      <div style={{ color: isUser ? C.accent : C.muted, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      {content}
    </div>
  );
}

function ConfirmBubble({ explanation, onConfirm, onRefute }) {
  return (
    <div
      aria-label="Model confirmation"
      style={{
        alignSelf: "flex-start",
        maxWidth: "85%",
        background: C.accent + "11",
        border: `1px solid ${C.accent}`,
        borderRadius: 8,
        padding: "12px 14px",
        color: C.text,
        fontFamily: FONT,
        fontSize: 11,
        lineHeight: 1.7,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ color: C.accent, fontSize: 10, fontWeight: 700 }}>Ready to build</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{explanation}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            background: C.accent,
            border: "none",
            borderRadius: 5,
            color: C.bg,
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 700,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Looks right — build it
        </button>
        <button
          type="button"
          onClick={onRefute}
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            borderRadius: 5,
            color: C.muted,
            fontFamily: FONT,
            fontSize: 11,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Something&apos;s wrong
        </button>
      </div>
    </div>
  );
}

function RefinementChips({ suggestions, onChipClick }) {
  const [hovered, setHovered] = useState(null);
  if (!suggestions || !suggestions.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onChipClick(suggestion)}
          onMouseEnter={() => setHovered(index)}
          onMouseLeave={() => setHovered(null)}
          style={{
            background: hovered === index ? C.accent : "transparent",
            border: `1px solid ${C.accent}`,
            borderRadius: 999,
            color: hovered === index ? C.bg : C.accent,
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 600,
            padding: "4px 14px",
            cursor: "pointer",
            transition: "background .15s, color .15s",
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

export function AiGeneratedModelPanel({ model, canEdit, onApplyModel, onSaveModel }) {
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [proposalExplanation, setProposalExplanation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [refinementChips, setRefinementChips] = useState([]);
  const [correctionMode, setCorrectionMode] = useState(false);
  const recognitionRef = useRef(null);
  const inputAreaRef = useRef(null);
  const systemPrompt = useMemo(() => buildModelBuilderSystemPrompt(), []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) transcript += chunk;
      }
      if (transcript) {
        setDraft(prev => {
          const separator = prev.trim() ? " " : "";
          return prev + separator + transcript;
        });
      }
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setError("Voice input was interrupted or could not be understood. Try again.");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
  };

  const callAndProcess = useCallback(async (messages, userText) => {
    let response;
    try {
      response = await callModelBuilder(systemPrompt, messages, () => {}, err => {
        setError(err?.message || "Model builder request failed.");
      });
    } catch (err) {
      setError(err?.message || "Model builder request failed.");
      setLoading(false);
      return;
    }
    const originalSuggestions = response?.suggestions;

    if (!response) { setLoading(false); return; }

    if (response.intent === "confirm") {
      const cleanExplanation = stripTrailingQuestion(response.summary || response.explanation || "");
      setPendingConfirm({ explanation: cleanExplanation, messages });
      setHistory(prev => [...prev, { role: "assistant-confirm", content: cleanExplanation }]);
      setLoading(false);
      return;
    }

    if (response.proposedModel) {
      let proposal = unwrapProposedModel(response.proposedModel);
      let validation = validateModel(proposal);
      let retryMessages = messages;
      const MAX_RETRIES = 3;

      for (let attempt = 0; attempt < MAX_RETRIES && validation.errors?.length; attempt++) {
        const errorSummary = validation.errors.map(e => `[${e.code}] ${e.message}`).join("\n");
        setHistory(prev => [...prev, {
          role: "system",
          content: `Draft has ${validation.errors.length} issue(s) (attempt ${attempt + 1}/${MAX_RETRIES}). Asking the assistant to fix them...`,
        }]);

        retryMessages = [...retryMessages, {
          role: "user",
          content: `The proposal has validation errors that must ALL be fixed. Return a complete corrected model:\n${errorSummary}`,
        }];

        const retryResponse = await callModelBuilder(systemPrompt, retryMessages, () => {}, () => {});
        if (retryResponse?.proposedModel) {
          proposal = unwrapProposedModel(retryResponse.proposedModel);
          response = retryResponse;
          validation = validateModel(proposal);
          retryMessages = [...retryMessages, { role: "assistant", content: JSON.stringify(retryResponse) }];
        } else {
          break;
        }
      }

      setProposal(proposal);
      setProposalExplanation(response.explanation || null);
      if (validation.errors?.length) {
        setNotice(`This draft still has ${validation.errors.length} model issue(s). Tidy those up in the editors before running.`);
      }
    }

    const questionText = Array.isArray(response.questions)
      ? response.questions.filter(Boolean).join("\n")
      : (typeof response.questions === "string" ? response.questions : "");
    const isRefineOrBuild = response.intent === "build" || response.intent === "refine" || response.intent === "template";
    const newTurns = [];

    if (response.flowDescription && response.intent !== "clarify") {
      const templateNote = response.intent === "template" && response.templateId
        ? `Based on template: ${response.templateId}\n\n`
        : "";
      newTurns.push({
        role: "system",
        content: `${templateNote}Working draft:\n${response.flowDescription}`,
      });
    }

    if (response.intent === "clarify") {
      newTurns.push({ role: "assistant", content: questionText });
    } else if (!response.proposedModel) {
      newTurns.push({ role: "assistant", content: response.explanation || "Model proposal received." });
    }

    setHistory(prev => [...prev, ...newTurns]);

    if (isRefineOrBuild) {
      const chips = Array.isArray(originalSuggestions) ? originalSuggestions.filter(Boolean) : [];
      setRefinementChips(chips);
    } else {
      setRefinementChips([]);
    }

    if (history.length >= 20) setNotice("Conversation is long — consider starting a new session.");
    setLoading(false);
  }, [systemPrompt, history.length]);

  const send = async (textOverride) => {
    const text = (typeof textOverride === "string" ? textOverride : draft).trim();
    if (!text || loading || !canEdit) return;
    const nextHistory = [...history, { role: "user", content: text }];
    setHistory(nextHistory);
    setDraft("");
    setError("");
    setNotice("");
    setRefinementChips([]);
    setCorrectionMode(false);
    setLoading(true);

    const messages = [
      ...nextHistory.slice(-10),
      {
        role: "user",
        content: buildModelBuilderUserMessage(text, model),
      },
    ];

    await callAndProcess(messages, text);
  };

  const confirmBuild = async () => {
    if (!pendingConfirm || loading) return;
    const savedConfirm = pendingConfirm;
    setPendingConfirm(null);
    const yesMessage = "yes";
    const nextHistory = [...history, { role: "user", content: yesMessage }];
    setHistory(nextHistory);
    setRefinementChips([]);
    setLoading(true);

    const messages = [
      ...savedConfirm.messages,
      { role: "assistant", content: savedConfirm.explanation },
      { role: "user", content: buildModelBuilderUserMessage(yesMessage, model) },
    ];

    await callAndProcess(messages, yesMessage);
  };

  const refuteConfirm = () => {
    setPendingConfirm(null);
    setCorrectionMode(true);
    setDraft("");
    setHistory(prev => prev.filter(turn => turn.role !== "assistant-confirm"));
    setTimeout(() => inputAreaRef.current?.querySelector("textarea")?.focus(), 0);
  };

  const handleChipClick = (suggestion) => {
    setRefinementChips([]);
    send(suggestion);
  };

  const applyProposal = (nextModel, validation = { errors: [], warnings: [] }) => {
    onApplyModel?.(nextModel);
    setProposal(null);
    setProposalExplanation(null);
    const errorText = validation.errors?.length
      ? `Draft applied with ${validation.errors.length} model issue(s). Fix them in the editors before running.`
      : "";
    const warningText = validation.warnings?.length ? validation.warnings.map(w => `[${w.code}] ${w.message}`).join("\n") : "";
    setNotice(errorText || warningText || "Draft applied. Save when you're happy with it.");
    setHistory(prev => [...prev, { role: "system", content: errorText || "Draft applied to the editable model." }]);
  };

  const saveProposal = async (nextModel, validation = { errors: [], warnings: [] }) => {
    await onSaveModel?.(nextModel);
    setProposal(null);
    setProposalExplanation(null);
    const errorText = validation.errors?.length
      ? `Draft saved with ${validation.errors.length} model issue(s). Fix them in the editors before running.`
      : "";
    const warningText = validation.warnings?.length ? validation.warnings.map(w => `[${w.code}] ${w.message}`).join("\n") : "";
    setNotice(errorText || warningText || "Draft applied and saved.");
    setHistory(prev => [...prev, { role: "system", content: errorText || "Draft applied and saved." }]);
  };

  const handleRefineFromPreview = () => {
    setProposal(null);
    setProposalExplanation(null);
    setTimeout(() => inputAreaRef.current?.querySelector("textarea")?.focus(), 0);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: proposal ? "minmax(320px, 1fr) minmax(360px, 0.95fr)" : "minmax(320px, 760px)", gap: 16, alignItems: "stretch" }}>
      <section aria-label="Describe conversation" style={{ display: "flex", flexDirection: "column", minHeight: 520, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
          <SH label="Describe" />
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
            Describe the system you want to build, or explain what you want changed.
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: 14, overflowY: "auto" }}>
          {history.map((turn, index) => {
            if (turn.role === "assistant-confirm") {
              return (
                <ConfirmBubble
                  key={index}
                  explanation={turn.content}
                  onConfirm={confirmBuild}
                  onRefute={refuteConfirm}
                />
              );
            }
            return <Bubble key={index} role={turn.role} content={turn.content} />;
          })}
          {refinementChips.length > 0 && (
            <RefinementChips suggestions={refinementChips} onChipClick={handleChipClick} />
          )}
          {notice && <Bubble role="system" content={notice} />}
          {error && <div role="alert"><InfoBox color={C.red}>{error}</InfoBox></div>}
        </div>
        <div ref={inputAreaRef} style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "end" }}>
          <Field
            label="Describe or refine"
            value={draft}
            onChange={setDraft}
            multiline
            rows={3}
            placeholder={correctionMode ? "Describe what's wrong or what needs changing" : "e.g. Add another doctor to triage, or build a post office with 2 clerks and a single queue"}
          />
          <button
            type="button"
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition) ? "Voice input" : "Voice input requires Chrome or Edge"}
            onClick={toggleListening}
            disabled={!canEdit || loading}
            style={{
              background: listening ? C.red + "22" : C.surface,
              border: `1px solid ${listening ? C.red : C.border}`,
              borderRadius: 5,
              color: listening ? C.red : C.muted,
              fontFamily: FONT,
              fontSize: 10,
              fontWeight: 600,
              padding: "7px 11px",
              cursor: canEdit && !loading ? "pointer" : "default",
              opacity: canEdit && !loading ? 1 : 0.5,
              transition: "all .15s",
              alignSelf: "end",
              lineHeight: 1,
            }}
          >
            {listening ? "■ Stop" : "Mic"}
          </button>
          <Btn variant="primary" onClick={() => send()} disabled={!draft.trim() || loading || !canEdit}>{loading ? "Sending..." : "Send"}</Btn>
        </div>
      </section>

      {proposal && (
        <ModelDiffPreview
          currentModel={model}
          proposedModel={proposal}
          llmExplanation={proposalExplanation}
          onApply={applyProposal}
          onApplyAndSave={saveProposal}
          onDiscard={() => { setProposal(null); setProposalExplanation(null); }}
          onRefine={handleRefineFromPreview}
          allowDraftApply
        />
      )}
    </div>
  );
}
