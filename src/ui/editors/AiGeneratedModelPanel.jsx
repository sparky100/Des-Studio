import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callModelBuilder, streamModelBuilder } from "../../llm/apiClient.js";
import { buildModelBuilderSystemPrompt, buildModelBuilderUserMessage } from "../../llm/model-builder-prompts.js";
import { Btn, Empty, Field, InfoBox, SH, MicIcon, ArrowUpIcon } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { useViewport } from "../shared/hooks.js";
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

function firstNonEmptyEffectSource(...sources) {
  for (const source of sources) {
    const normalized = normalizeEffect(source);
    if (effectText(normalized).trim()) return source;
  }
  return sources.find(source => source != null);
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
  const match = effectText(effect).match(/ASSIGN\(([^,]+)\s*,\s*([^,)]+)(?:\s*,.*)?\)/i);
  return match ? { queueOrCustomer: match[1].trim(), server: match[2].trim() } : null;
}

function servicePartsFromCondition(condition) {
  const text = conditionToLegacyString(condition);
  const queue = text.match(/queue\(([^)]+)\)\.length/i)?.[1]?.trim();
  const server = text.match(/idle\(([^)]+)\)\.count/i)?.[1]?.trim();
  return queue && server ? { queueOrCustomer: queue, server } : null;
}

function normalizeCEventEffect(event = {}, queues = []) {
  const effect = normalizeEffect(firstNonEmptyEffectSource(event.effect, event.effects, event.action, event.actions));
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

function chooseFirstQuestion(description = "") {
  const text = String(description || "").toLowerCase();
  const mentionsResource = /\b(clerk|server|doctor|nurse|agent|staff|machine|bay|room|operator|teller|worker|resource|capacity)\b/.test(text);
  const mentionsArrivalTiming = /\b(arriv|every|per hour|per minute|rate|schedule|appointment|demand|interarrival|inter-arrival)\b/.test(text);
  const mentionsServiceTiming = /\b(service|takes|duration|process|processing|handle|serve|consult|repair|minutes|hours)\b/.test(text);

  if (!mentionsResource) {
    return "What resource or staff group limits the work first, and how many are available at the start?";
  }
  if (!mentionsArrivalTiming) {
    return "How do arrivals enter the system: a rough rate, a schedule, or something else?";
  }
  if (!mentionsServiceTiming) {
    return "Roughly how long does the main service step take?";
  }
  return "What result should this model help you compare or improve first?";
}

function buildInitialUnderstandingMessage(model = {}) {
  const description = String(model.description || "").trim();
  if (!description) return "";
  const name = String(model.name || "this model").trim();
  const question = chooseFirstQuestion(description);
  return [
    `Here is what I understand about "${name}":`,
    "",
    description,
    "",
    "I will treat this as a system where entities arrive, may wait, use limited resources, and then leave or move to another step. I will keep any uncertain timing, capacity, and routing assumptions visible before building.",
    "",
    `Before I build it: ${question}`,
  ].join("\n");
}

function sanitiseRawModel(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const source = raw.model_json || raw.modelJson || raw.model || raw;
  const ensureEffectArray = effect => {
    if (Array.isArray(effect)) return effect;
    return effect ? [String(effect)] : [];
  };
  const sanitised = { ...source };
  if (Array.isArray(sanitised.bEvents)) {
    sanitised.bEvents = sanitised.bEvents.map(ev => {
      const effect = ensureEffectArray(ev.effect);
      const hasArrive = effect.some(e => typeof e === "string" && /\bARRIVE\s*\(/i.test(e));
      const result = {
        ...ev,
        effect,
        scheduledTime: ev.scheduledTime != null ? String(ev.scheduledTime) : ev.scheduledTime,
      };
      if (hasArrive) delete result.probabilisticRouting;
      return result;
    });
  }
  if (Array.isArray(sanitised.cEvents)) {
    sanitised.cEvents = sanitised.cEvents.map(ev => ({
      ...ev,
      effect: ensureEffectArray(ev.effect),
    }));
  }
  // Preserve top-level fields (name, description) that unwrapProposedModel reads from raw
  return raw.model_json || raw.modelJson || raw.model
    ? { ...raw, [raw.model_json ? "model_json" : raw.modelJson ? "modelJson" : "model"]: sanitised }
    : sanitised;
}

function Bubble({ role, content }) {
  const { C, FONT } = useTheme();
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

function BuildingIndicator() {
  const { C, FONT } = useTheme();
  return (
    <div style={{
      alignSelf: "flex-start",
      maxWidth: "72%",
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "10px 12px",
      color: C.text,
      fontFamily: FONT,
      fontSize: 11,
      lineHeight: 1.7,
    }}>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Assistant</div>
      <span style={{ color: C.muted }}>
        Building your model — this may take a moment…
      </span>
    </div>
  );
}

function ConfirmBubble({ explanation, onConfirm, onRefute }) {
  const { C, FONT } = useTheme();
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
  const { C, FONT } = useTheme();
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

export function AiGeneratedModelPanel({ model, canEdit, onApplyModel, onSaveModel, initialDraft = "" }) {
  const { C, FONT } = useTheme();
  const { isMobile, isCompact } = useViewport();
  const [draft, setDraft] = useState(initialDraft);
  useEffect(() => { if (initialDraft) setDraft(initialDraft); }, [initialDraft]);
  const [history, setHistory] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [proposalExplanation, setProposalExplanation] = useState(null);
  const [error, setError] = useState("");
  const [rawErrorText, setRawErrorText] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [refinementChips, setRefinementChips] = useState([]);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [mobilePane, setMobilePane] = useState("conversation");
  const recognitionRef = useRef(null);
  const inputAreaRef = useRef(null);
  const chatScrollRef = useRef(null);
  const systemPrompt = useMemo(() => buildModelBuilderSystemPrompt(), []);
  const autoTriggeredRef = useRef(false);
  const openingMessage = useMemo(() => {
    if (history.length > 0) return null;
    const eCount = model?.entityTypes?.length || 0;
    const bCount = model?.bEvents?.length || 0;
    const qCount = model?.queues?.length || 0;
    const cCount = model?.cEvents?.length || 0;
    const hasContent = eCount || bCount || qCount || cCount;
    if (hasContent) {
      const name = model?.name || "Untitled";
      return `You have a model "${name}" with ${eCount} entity type${eCount !== 1 ? "s" : ""}, ${bCount} B-event${bCount !== 1 ? "s" : ""}, ${qCount} queue${qCount !== 1 ? "s" : ""}, and ${cCount} C-event${cCount !== 1 ? "s" : ""}. Describe what you want changed.`;
    }
    if (model?.description) return null;
    return "I don't know anything about your model yet. What would you like to build?";
  }, [model, history.length]);

  useEffect(() => {
    const chatEl = chatScrollRef.current;
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }, [history, loading]);

  useEffect(() => {
    if (isMobile && proposal) setMobilePane("proposal");
  }, [isMobile, proposal]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    const desc = model?.description;
    const hasContent = model?.entityTypes?.length || model?.bEvents?.length || model?.queues?.length || model?.cEvents?.length;
    if (!desc || hasContent || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    setHistory([{ role: "assistant", content: buildInitialUnderstandingMessage(model) }]);
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
    setRawErrorText("");
  };

  const callAndProcess = useCallback(async (messages, userText) => {
    let response;
    try {
      response = await streamModelBuilder(systemPrompt, messages, {
        onToken: () => {},
        onError: err => {
          setError(err?.message || "Model builder request failed.");
          if (err?.rawResponse) setRawErrorText(err.rawResponse);
        },
      });
    } catch (err) {
      setError(err?.message || "Model builder request failed.");
      if (err?.rawResponse) setRawErrorText(err.rawResponse);
      setLoading(false);
      return;
    }
    let originalSuggestions = response?.suggestions;

    if (!response) { setLoading(false); return; }

    if (response.intent === "confirm") {
      const cleanExplanation = stripTrailingQuestion(response.summary || response.explanation || "");
      setPendingConfirm({ explanation: cleanExplanation, messages });
      setHistory(prev => [...prev, { role: "assistant-confirm", content: cleanExplanation }]);
      setLoading(false);
      return;
    }

    // The assistant should have built something here (it's past clarify/confirm), but
    // sometimes replies without a proposedModel. Ask it to try again before giving up —
    // there was previously no recovery path for this, only for an invalid (but present) model.
    if (response.intent !== "clarify" && !response.proposedModel) {
      const MAX_MISSING_RETRIES = 2;
      let retryMessages = messages;
      let attempted = false;
      for (let attempt = 0; attempt < MAX_MISSING_RETRIES && !response.proposedModel; attempt++) {
        attempted = true;
        setHistory(prev => [...prev, {
          role: "system",
          content: `The assistant's last reply didn't include a model (attempt ${attempt + 1}/${MAX_MISSING_RETRIES}). Asking it to try again...`,
        }]);

        retryMessages = [...retryMessages, {
          role: "assistant",
          content: JSON.stringify({ intent: response.intent, explanation: response.explanation || null }),
        }, {
          role: "user",
          content: `Your last response was missing proposedModel. Respond again with the full JSON envelope, intent "build", and the complete proposedModel populated — do not ask another question or re-summarize.`,
        }];

        const retryResponse = await callModelBuilder(systemPrompt, retryMessages, () => {}, () => {});
        if (!retryResponse) break;
        response = retryResponse;
        originalSuggestions = response?.suggestions;
      }
      if (attempted && response.proposedModel) {
        setHistory(prev => [...prev, { role: "system", content: "Model built — see the proposal on the right." }]);
      }
    }

    if (response.proposedModel) {
      let proposal = unwrapProposedModel(sanitiseRawModel(response.proposedModel));
      let validation = validateModel(proposal);
      let retryMessages = messages;
      const MAX_RETRIES = 3;

      for (let attempt = 0; attempt < MAX_RETRIES && validation.errors?.length; attempt++) {
        // Group errors by section so the fix request is as targeted as possible
        const bySect = {};
        for (const e of validation.errors) {
          const sect = e.path?.split(".")?.[0] || "model";
          (bySect[sect] = bySect[sect] || []).push(`[${e.code}] ${e.message}`);
        }
        const errorDetail = Object.entries(bySect)
          .map(([section, errs]) => `${section}:\n${errs.join("\n")}`)
          .join("\n\n");

        setHistory(prev => [...prev, {
          role: "system",
          content: `Draft has ${validation.errors.length} issue(s) (attempt ${attempt + 1}/${MAX_RETRIES}). Asking the assistant to fix them...`,
        }]);

        retryMessages = [...retryMessages, {
          role: "user",
          content: `Fix the following validation errors and return the complete corrected model:\n\n${errorDetail}`,
        }];

        const retryResponse = await callModelBuilder(systemPrompt, retryMessages, () => {}, () => {});
        if (retryResponse?.proposedModel) {
          proposal = unwrapProposedModel(sanitiseRawModel(retryResponse.proposedModel));
          response = retryResponse;
          validation = validateModel(proposal);
          retryMessages = [...retryMessages, {
            role: "assistant",
            content: JSON.stringify({ intent: retryResponse.intent, proposedModel: retryResponse.proposedModel }),
          }];
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
      // Retries above were exhausted without a model — surface this as a real error
      // rather than a success-sounding chat bubble, so the user isn't left thinking
      // a model was built when nothing was.
      setError("The assistant didn't return a model. Try again, or simplify your description.");
      setRawErrorText(JSON.stringify(response, null, 2));
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
    setRawErrorText("");
    setNotice("");
    setRefinementChips([]);
    setCorrectionMode(false);
    setLoading(true);

    const messages = [
      ...nextHistory.slice(-30),
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
    setError("");
    setRawErrorText("");
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

  const showConversation = !isMobile || mobilePane === "conversation" || !proposal;
  const showProposal = proposal && (!isMobile || mobilePane === "proposal");
  const layoutColumns = proposal
    ? isCompact
      ? "minmax(320px, 1fr) minmax(320px, 1fr)"
      : "minmax(360px, 1.05fr) minmax(380px, 0.95fr)"
    : "minmax(320px, 760px)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", minHeight: 0, overflow: "hidden" }}>
      {isMobile && proposal && (
        <div role="tablist" aria-label="Describe panes" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flexShrink: 0 }}>
          {[
            { id: "conversation", label: "Conversation" },
            { id: "proposal", label: "Proposal" },
          ].map(pane => (
            <button
              key={pane.id}
              type="button"
              role="tab"
              aria-selected={mobilePane === pane.id}
              onClick={() => setMobilePane(pane.id)}
              style={{
                background: mobilePane === pane.id ? C.accent + "22" : C.panel,
                border: `1px solid ${mobilePane === pane.id ? C.accent : C.border}`,
                borderRadius: 6,
                color: mobilePane === pane.id ? C.accent : C.muted,
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 700,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              {pane.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : layoutColumns, gap: 16, alignItems: "stretch", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {showConversation && (
      <section aria-label="Describe conversation" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>
          <SH label="Describe" />
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
            Describe the system you want to build, or explain what you want changed.
          </div>
        </div>
        <div ref={chatScrollRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10, padding: 14, overflowY: "auto" }}>
          {openingMessage && <Bubble role="assistant" content={openingMessage} />}
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
          {refinementChips.length > 0 && <RefinementChips suggestions={refinementChips} onChipClick={handleChipClick} />}
          {isMobile && proposal && (
            <button
              type="button"
              onClick={() => setMobilePane("proposal")}
              style={{
                alignSelf: "stretch",
                background: C.accent + "18",
                border: `1px solid ${C.accent}`,
                borderRadius: 6,
                color: C.accent,
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 700,
                padding: "8px 10px",
                cursor: "pointer",
              }}
            >
              Review proposal
            </button>
          )}
          {loading && <BuildingIndicator />}
          {notice && <Bubble role="system" content={notice} />}
          {error && <div role="alert"><InfoBox color={C.red}>{error}</InfoBox>{rawErrorText ? <details style={{marginTop:6,cursor:"pointer"}}><summary style={{fontSize:11,color:C.muted,fontFamily:FONT}}>Show raw AI response ({rawErrorText.length} chars)</summary><pre style={{fontSize:10,fontFamily:"monospace",lineHeight:1.4,maxHeight:200,overflow:"auto",padding:8,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,whiteSpace:"pre-wrap",wordBreak:"break-all",marginTop:4}}>{rawErrorText}</pre></details> : null}</div>}
          <div />
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
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: listening ? C.red + "22" : "transparent",
              border: `1px solid ${listening ? C.red : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: canEdit && !loading ? "pointer" : "not-allowed",
              opacity: canEdit && !loading ? 1 : 0.45,
              transition: "all .15s",
              alignSelf: "end",
            }}
          >
            <MicIcon size={15} color={listening ? C.red : C.muted} />
          </button>
          <button
            type="button"
            aria-label="Send"
            onClick={() => send()}
            disabled={!draft.trim() || loading || !canEdit}
            style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: !draft.trim() || loading || !canEdit ? C.muted : C.accent,
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: !draft.trim() || loading || !canEdit ? "not-allowed" : "pointer",
              opacity: !draft.trim() || loading || !canEdit ? 0.35 : 1,
              transition: "opacity .12s, background .12s",
              alignSelf: "end",
            }}
          >
            <ArrowUpIcon size={16} color={C.bg} />
          </button>
        </div>
      </section>
      )}

      {showProposal && (
        <ModelDiffPreview
          currentModel={model}
          proposedModel={proposal}
          llmExplanation={proposalExplanation}
          onApply={applyProposal}
          onApplyAndSave={saveProposal}
          onDiscard={() => { setProposal(null); setProposalExplanation(null); }}
          onRefine={handleRefineFromPreview}
          allowDraftApply
          isNewModel={!model?.entityTypes?.length && !model?.bEvents?.length && !model?.queues?.length}
        />
      )}
      </div>
    </div>
  );
}
