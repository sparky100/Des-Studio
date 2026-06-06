// ui/execute/AiAssistantPanel.jsx — AiAssistantPanel

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
;
import { Btn, MicIcon, ArrowUpIcon } from "../shared/components.jsx";
import { useToast } from "../shared/ToastContext.jsx";
import { streamNarrative } from "../../llm/apiClient.js";
import { buildCiResults, buildComparisonPrompt, buildExplainResultsPrompt, buildResultsQueryPrompt, buildSuggestionPrompt, parseSuggestionResponse, applySuggestionPatch, buildPlanRefinementPrompt, parsePlanRefinementResponse, applySchedulePatch, buildModelQueryPrompt } from "../../llm/prompts.js";
import { makeRunPromptPayload, makeRunLabel, makeSavedRunPromptPayload } from "./executeHelpers.js";
import { DiagnosticsTab } from "./DiagnosticsTab.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

function ConfidenceBadge({ confidence }) {
  const { C, FONT } = useTheme();
  const color = confidence === "high" ? C.green : confidence === "medium" ? C.amber : C.red;
  return (
    <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color, border: `1px solid ${color}44`, borderRadius: 3, padding: "1px 5px", letterSpacing: 1 }}>
      {String(confidence || "").toUpperCase()}
    </span>
  );
}

const KPI_ROWS = [
  { key: "summary.avgWait", label: "Avg wait" },
  { key: "summary.avgSvc", label: "Avg service" },
  { key: "summary.avgSojourn", label: "Avg sojourn" },
  { key: "summary.served", label: "Served" },
  { key: "summary.reneged", label: "Reneged" },
  { key: "summary.totalCost", label: "Total cost" },
  { key: "summary.costPerServed", label: "Cost per served" },
];

function BeforeAfterTable({ goals, baselineStats, afterStats }) {
  const { C, FONT } = useTheme();
  const fmt = v => v === null ? "—" : Number.isFinite(v) ? (Number.isInteger(v) ? v.toString() : v.toFixed(1)) : "—";
  const delta = (before, after) => {
    if (before === null || after === null) return null;
    if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
    if (before === 0) return after === 0 ? "0%" : "∞";
    const pct = ((after - before) / Math.abs(before)) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  const rows = [];
  for (const kpi of KPI_ROWS) {
    const beforeStat = baselineStats?.[kpi.key];
    const afterStat = afterStats?.[kpi.key];
    const beforeVal = beforeStat?.mean ?? null;
    const afterVal = afterStat?.mean ?? null;
    if (beforeVal === null && afterVal === null) continue;
    const d = delta(beforeVal, afterVal);
    const dColor = d === null ? C.muted : d.startsWith("+") ? C.red : C.green;
    rows.push(
      <tr key={kpi.key}>
        <td style={{ color: C.text, padding: "2px 4px" }}>{kpi.label}</td>
        <td style={{ color: C.muted, padding: "2px 4px" }}>{fmt(beforeVal)}</td>
        <td style={{ color: C.text, padding: "2px 4px" }}>{fmt(afterVal)}</td>
        <td style={{ color: dColor, padding: "2px 4px", fontWeight: 600 }}>{d ?? "—"}</td>
      </tr>
    );
  }

  if (goals?.length) {
    for (const g of goals) {
      const beforeStat = baselineStats?.[g.metric];
      const afterStat = afterStats?.[g.metric];
      const beforeVal = beforeStat?.mean ?? null;
      const afterVal = afterStat?.mean ?? null;
      const met = afterVal !== null
        ? (g.operator === "<"  ? afterVal < g.target
         : g.operator === "<=" ? afterVal <= g.target
         : g.operator === ">"  ? afterVal > g.target
         : g.operator === ">=" ? afterVal >= g.target
         : afterVal === g.target)
        : null;
      const metColor = met === true ? C.green : met === false ? C.red : C.muted;
      rows.push(
        <tr key={`goal-${g.metric}`} style={{ borderTop: `1px solid ${C.border}` }}>
          <td style={{ color: C.text, padding: "2px 4px" }}>{g.label || g.metric}</td>
          <td style={{ color: C.muted, padding: "2px 4px" }}>{fmt(beforeVal)}</td>
          <td style={{ color: met === true ? C.green : met === false ? C.red : C.text, padding: "2px 4px" }}>{fmt(afterVal)}</td>
          <td style={{ color: metColor, padding: "2px 4px", fontWeight: 700 }}>{met === true ? "MET" : met === false ? "MISSED" : "—"}</td>
        </tr>
      );
    }
  }

  if (!rows.length) return null;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: FONT, marginTop: 8 }}>
      <thead>
        <tr>
          {["Metric", "Before", "After", "Change"].map(h => (
            <th key={h} scope="col" style={{ textAlign: "left", color: C.muted, padding: "2px 4px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

function SuggestionCard({ suggestion, model, aggregateStats, onRunWithPatch, onApplyPatchedModel, verifyStatus, verifyResult, onSaved }) {
  const { C, FONT } = useTheme();
  const isManual = suggestion.change?.type === "manual";
  const canApply = !isManual && typeof onRunWithPatch === "function";
  const canSave = !isManual && typeof onApplyPatchedModel === "function" && verifyResult;
  const canApplyDirect = !isManual && typeof onApplyPatchedModel === "function" && verifyStatus !== "saved";
  const running = verifyStatus === "running";
  const [runName, setRunName] = useState("");

  const changeLabel = isManual
    ? "Manual change required"
    : `${suggestion.change?.target}: ${suggestion.change?.from} → ${suggestion.change?.to}`;

  const handleSave = () => {
    if (!canSave) return;
    const patched = applySuggestionPatch(model, suggestion.change);
    onApplyPatchedModel(patched, suggestion);
    onSaved?.();
  };

  const handleApplyDirect = () => {
    if (!canApplyDirect) return;
    const patched = applySuggestionPatch(model, suggestion.change);
    onApplyPatchedModel(patched, suggestion);
    onSaved?.();
  };

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, marginTop: 8, background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}44`, borderRadius: 3, padding: "1px 5px" }}>
          #{suggestion.rank}
        </span>
        <ConfidenceBadge confidence={suggestion.confidence} />
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Constraint: </span>{suggestion.constraint}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Cause: </span>{suggestion.cause}
      </div>
      <div style={{ color: isManual ? C.muted : C.amber, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Proposed: </span>{changeLabel}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Predicted: </span>{suggestion.predicted}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 6 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Goal impact: </span>{suggestion.goalImpact}
      </div>
      <Btn
        small
        variant="primary"
        disabled={!canApply || running}
        onClick={() => onRunWithPatch(suggestion)}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {running ? "Running simulation…" : "Run Comparison"}
      </Btn>
      {canApplyDirect && !verifyResult && (
        <Btn
          small
          variant="ghost"
          disabled={running}
          onClick={handleApplyDirect}
          style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
        >
          Apply to model
        </Btn>
      )}
      {running && (
        <div style={{ marginTop: 8, padding: "10px 12px", background: C.surface, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic", animation: "pulse 1.5s ease-in-out infinite" }}>
            Verifying…
          </div>
        </div>
      )}
      {!running && verifyResult && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>BEFORE / AFTER</div>
          <BeforeAfterTable
            goals={model?.goals || []}
            baselineStats={verifyResult._baselineStats ?? aggregateStats}
            afterStats={verifyResult.aggregateStats}
          />
          <div style={{ marginTop: 8, padding: "8px 10px", background: `${C.accent}11`, borderRadius: 4, border: `1px solid ${C.accent}33` }}>
            <div style={{ fontSize: 10, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
              This run used a temporary copy of your model. The results above show what would happen with this change.
              To make it permanent, save the change to your model.
            </div>
          </div>
          {canSave && verifyStatus !== "saved" && (
            <Btn
              small
              variant="primary"
              onClick={handleSave}
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              Save this change to model
            </Btn>
          )}
          {verifyStatus === "saved" && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: `${C.green}15`, borderRadius: 4, border: `1px solid ${C.green}44` }}>
              <div style={{ fontSize: 11, color: C.green, fontFamily: FONT, fontWeight: 600 }}>
                Change applied to model. Save the model to persist.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeasibilityBadge({ feasible }) {
  const { C, FONT } = useTheme();
  const color = feasible ? C.green : C.red;
  const label = feasible ? "Within capacity" : "Requires capacity increase";
  return (
    <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color, border: `1px solid ${color}44`, borderRadius: 3, padding: "1px 5px", letterSpacing: 1 }}>
      {label.toUpperCase()}
    </span>
  );
}

function RefinementCard({ card, model, aggregateStats, onApplyAndRerun, cardStatus, cardResult }) {
  const { C, FONT } = useTheme();
  const running = cardStatus === "running";
  const hasResult = cardStatus === "done" && cardResult;
  const hasError = cardStatus === "error";
  const applyError = cardStatus === "applyError";

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, marginTop: 8, background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}44`, borderRadius: 3, padding: "1px 5px" }}>
          #{card.rank}
        </span>
        <FeasibilityBadge feasible={card.feasible} />
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ fontWeight: 700 }}>{card.change}</span>
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Rationale: </span>{card.rationale}
      </div>
      <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 6 }}>
        <span style={{ color: C.muted, fontSize: 10 }}>Goal impact: </span>{card.goalImpact}
      </div>
      {onApplyAndRerun && (
        <Btn
          small
          variant="primary"
          disabled={!card.feasible || running || hasResult}
          onClick={() => onApplyAndRerun(card)}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {running ? "Running…" : hasResult ? "Applied" : "Apply & Re-run"}
        </Btn>
      )}
      {running && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: FONT, fontStyle: "italic" }}>
          Running revised schedule…
        </div>
      )}
      {applyError && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontFamily: FONT }}>
          Could not apply — schedule entry not found.
        </div>
      )}
      {hasError && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontFamily: FONT }}>
          Re-run failed — see console for details.
        </div>
      )}
      {hasResult && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>BEFORE / AFTER</div>
          <BeforeAfterTable
            goals={model?.goals || []}
            baselineStats={cardResult._baselineStats ?? aggregateStats}
            afterStats={cardResult.aggregateStats}
          />
        </div>
      )}
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = "aiPanel.sidebarWidth";
const SIDEBAR_MIN = 260;
const SIDEBAR_MAX = 640;

export const AiAssistantPanel = ({
  model,
  results,
  exportConfig,
  aggregateStats,
  comparisonRuns,
  comparisonLoading,
  comparisonError,
  onClose,
  onSaveInsights,
  onRunWithPatch,
  onApplyPatchedModel,
  embedded = false,
  overlay = false,
  sidebar = false,
  mobileFullscreen = false,
  activeTab = null,
  inline = false,
  triggerAction = null, // { action: "explain"|"compare"|"refine", seq: number }
  onDiagnosticsNodeSelect = null,
}) => {
  const { C, FONT } = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
    return Number.isFinite(stored) ? Math.min(Math.max(stored, SIDEBAR_MIN), SIDEBAR_MAX) : 320;
  });

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      const next = Math.min(Math.max(startWidth + delta, SIDEBAR_MIN), SIDEBAR_MAX);
      setSidebarWidth(next);
    };
    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const delta = startX - ev.clientX;
      const final = Math.min(Math.max(startWidth + delta, SIDEBAR_MIN), SIDEBAR_MAX);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(final));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);
  const isRunContext = activeTab === "execute";
  const isResultsContext = activeTab === "results";
  const isOverviewContext = activeTab === "overview";
  const toast = useToast();
  const [activeMode, setActiveMode] = useState(triggerAction?.action || "explain");

  const handleModeChange = (mode) => {
    if (mode !== activeMode) {
      setResponse("");
      setStatus("idle");
      setParsedSuggestion(null);
    }
    setActiveMode(mode);
  };
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(comparisonRuns[0]?.id || "");
  const [queryText, setQueryText] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [savedSummary, setSavedSummary] = useState(null);
  const [activeKind, setActiveKind] = useState(null);
  const [parsedSuggestion, setParsedSuggestion] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState({});
  const [verifyResults, setVerifyResults] = useState({});
  const [refineStatus, setRefineStatus] = useState("idle");
  const [refineError, setRefineError] = useState("");
  const [refineParsed, setRefineParsed] = useState(null);
  const [refineCardStatus, setRefineCardStatus] = useState({});
  const [refineCardResults, setRefineCardResults] = useState({});
  const [modelQueryText, setModelQueryText] = useState("");
  const [listening, setListening] = useState(false);
  const [micTarget, setMicTarget] = useState("model"); // "model" | "query"
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const responseAreaRef = useRef(null);
  const actionFnsRef = useRef({});
  const ciResults = useMemo(() => buildCiResults(aggregateStats), [aggregateStats]);
  const sensitivityReady = ciResults.some(item => item.n >= 5);
  const isStreaming = status === "loading" || status === "streaming";
  const selectedRun = comparisonRuns.find(run => run.id === selectedRunId);

  useEffect(() => {
    if (!selectedRunId && comparisonRuns[0]) setSelectedRunId(comparisonRuns[0].id);
  }, [comparisonRuns, selectedRunId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Clear conversation when context group changes (design ↔ run ↔ results)
  const contextGroup = isRunContext ? "run" : isResultsContext ? "results" : "design";
  useEffect(() => {
    abortRef.current?.abort();
    setConversationHistory([]);
    setResponse("");
    setStatus("idle");
    setError("");
    setParsedSuggestion(null);
    setVerifyStatus({});
    setVerifyResults({});
    setActiveKind(null);
    setModelQueryText("");
    setQueryText("");
  }, [contextGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (responseAreaRef.current) {
      responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight;
    }
  }, [response, conversationHistory]);

  const runPrompt = useCallback((prompt, kind = null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setResponse("");
    setError("");
    setStatus("loading");
    setActiveKind(kind);
    if (kind !== "suggestion" && kind !== "explainResults") {
      setParsedSuggestion(null);
      setVerifyStatus({});
      setVerifyResults({});
    }

    let accumulated = "";
    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        setStatus("streaming");
        accumulated += token;
        setResponse(accumulated);
      },
      onComplete: () => {
        abortRef.current = null;
        setStatus("complete");
        if (kind === "suggestion" || kind === "explainResults") {
          setParsedSuggestion(parseSuggestionResponse(accumulated));
          setResponse("");
        }
      },
      onError: err => {
        abortRef.current = null;
        const msg = err?.message || "Analysis unavailable";
        setError(msg);
        setStatus("error");
        if (/rate.?limit|429/i.test(msg)) toast.warning("AI rate limit reached. Please wait a moment and try again.");
      },
    });
  }, [toast]);

  const runQuery = useCallback((question) => {
    if (!question.trim() || !results) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setStatus("streaming");
    setActiveKind("query");

    const userEntry = { role: "user", content: question };
    setConversationHistory(prev => [...prev, userEntry]);
    setQueryText("");

    const prompt = buildResultsQueryPrompt(
      question,
      model,
      { ...results, aggregateStats },
      conversationHistory
    );

    let accumulated = "";
    streamNarrative(prompt, {
      signal: controller.signal,
      onToken: token => {
        accumulated += token;
        setResponse(accumulated);
      },
      onComplete: () => {
        abortRef.current = null;
        setConversationHistory(prev => [...prev, { role: "assistant", content: accumulated }]);
        setResponse("");
        setStatus("complete");
      },
      onError: err => {
        abortRef.current = null;
        const msg = err?.message || "Query unavailable";
        setError(msg);
        setStatus("error");
        if (/rate.?limit|429/i.test(msg)) toast.warning("AI rate limit reached. Please wait a moment and try again.");
      },
    });
  }, [model, results, aggregateStats, conversationHistory, toast]);

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus(response ? "complete" : "idle");
  };

  const copyResponse = () => {
    const textToCopy = response || conversationHistory.map(e =>
      `${e.role === "user" ? "Q" : "A"}: ${e.content}`
    ).join("\n\n");
    if (!textToCopy || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(textToCopy);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setResponse("");
    setStatus("idle");
    setError("");
    setParsedSuggestion(null);
    setVerifyStatus({});
    setVerifyResults({});
  };

  const toggleListening = (target) => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        if (target === "query") {
          setQueryText(prev => prev + (prev.trim() ? " " : "") + transcript);
        } else {
          setModelQueryText(prev => prev + (prev.trim() ? " " : "") + transcript);
        }
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setMicTarget(target);
    setListening(true);
  };

  const runModelQuery = useCallback((question) => {
    if (!question.trim() || isStreaming) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const messages = buildModelQueryPrompt(question, model, conversationHistory);
    setConversationHistory(prev => [...prev, { role: "user", content: question }]);
    setModelQueryText("");
    setResponse("");
    setError("");
    setStatus("streaming");
    setActiveKind("modelQuery");
    let accumulated = "";
    streamNarrative(messages, {
      signal: controller.signal,
      onToken: token => { accumulated += token; setResponse(accumulated); },
      onComplete: () => {
        abortRef.current = null;
        setConversationHistory(prev => [...prev, { role: "assistant", content: accumulated }]);
        setResponse("");
        setStatus("complete");
      },
      onError: err => {
        abortRef.current = null;
        setError(err?.message || "Query unavailable");
        setStatus("error");
      },
    });
  }, [model, conversationHistory, isStreaming]);

  const explainResults = () => {
    runPrompt(buildExplainResultsPrompt(model, exportConfig, {
      ...results,
      aggregateStats,
    }, ciResults), "explainResults");
  };

  const compareRuns = () => {
    if (!selectedRun) return;
    const comparisonPayload = selectedRun.source === "saved"
      ? makeSavedRunPromptPayload(selectedRun.payload)
      : makeRunPromptPayload(selectedRun.label, selectedRun.payload);

    // Resolve comparison model structure: session reps share the current model;
    // saved runs may carry a snapshot in results_json._model_snapshot.
    const modelB = selectedRun.source === "session"
      ? model
      : (selectedRun.payload?.results_json?._model_snapshot ?? null);

    runPrompt(buildComparisonPrompt(
      model.name,
      makeRunPromptPayload("Current completed run", { results, experiment: exportConfig }),
      comparisonPayload,
      model,
      modelB
    ), "comparison");
  };

  const handleApplyAndRerun = useCallback(async (suggestion) => {
    if (!onRunWithPatch) return;
    const rank = suggestion.rank;
    setVerifyStatus(prev => ({ ...prev, [rank]: "running" }));
    try {
      const patched = applySuggestionPatch(model, suggestion.change);

      // Snapshot the baseline at click-time (null if no valid prior run exists).
      // Must be null not {} when empty so the ?? fallback in BeforeAfterTable works.
      const capturedBaseline = Object.values(aggregateStats).some(ci => ci?.mean != null)
        ? aggregateStats
        : null;

      const result = await onRunWithPatch(patched);
      if (result) {
        setVerifyResults(prev => ({ ...prev, [rank]: { ...result, _baselineStats: capturedBaseline } }));
        setVerifyStatus(prev => ({ ...prev, [rank]: "done" }));
      } else {
        setVerifyStatus(prev => ({ ...prev, [rank]: "error" }));
      }
    } catch {
      setVerifyStatus(prev => ({ ...prev, [rank]: "error" }));
    }
  }, [model, onRunWithPatch, aggregateStats]);

  const handleQueryKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runQuery(queryText);
    }
  };

  const hasSchedule = (
    (Array.isArray(model?.schedules) && model.schedules.length > 0) ||
    (Array.isArray(model?.shiftSchedules) && model.shiftSchedules.length > 0) ||
    (model?.entityTypes || []).some(et => Array.isArray(et.shiftSchedule) && et.shiftSchedule.length > 0) ||
    (model?.bEvents || []).some(be => (be.schedules || []).some(s => s.scheduleRef || (s.rows?.length > 0)))
  );

  const handleRefinePlan = useCallback(async () => {
    if (!hasSchedule) {
      setRefineStatus("no-schedule");
      return;
    }
    setRefineStatus("loading");
    setRefineError("");
    setRefineParsed(null);
    setRefineCardStatus({});
    setRefineCardResults({});
    const prompt = buildPlanRefinementPrompt(model, exportConfig, { ...results, aggregateStats });
    let accumulated = "";
    streamNarrative(prompt, {
      onToken: token => { accumulated += token; },
      onComplete: () => {
        try {
          const parsed = parsePlanRefinementResponse(accumulated);
          setRefineParsed(parsed);
          setRefineStatus("complete");
        } catch (err) {
          setRefineError(err?.message || "Plan refinement returned an unexpected format");
          setRefineStatus("error");
        }
      },
      onError: err => {
        setRefineError(err?.message || "Plan refinement unavailable");
        setRefineStatus("error");
      },
    });
  }, [model, exportConfig, results, aggregateStats]);

  const handleRefineApplyAndRerun = useCallback(async (card) => {
    if (!onRunWithPatch) return;
    const rank = card.rank;
    setRefineCardStatus(prev => ({ ...prev, [rank]: "running" }));
    try {
      const patchedModel = applySchedulePatch(model, card);

      const capturedBaseline = Object.values(aggregateStats).some(ci => ci?.mean != null)
        ? aggregateStats
        : null;

      const result = await onRunWithPatch(patchedModel);
      if (result) {
        setRefineCardResults(prev => ({ ...prev, [rank]: { ...result, _baselineStats: capturedBaseline } }));
        setRefineCardStatus(prev => ({ ...prev, [rank]: "done" }));
      } else {
        setRefineCardStatus(prev => ({ ...prev, [rank]: "error" }));
      }
    } catch (err) {
      if (err?.message?.includes("schedule entry not found") || err?.message?.includes("no schedule entry")) {
        setRefineCardStatus(prev => ({ ...prev, [rank]: "applyError" }));
      } else {
        console.error("Refine plan re-run failed:", err);
        setRefineCardStatus(prev => ({ ...prev, [rank]: "error" }));
      }
    }
  }, [model, onRunWithPatch, aggregateStats]);

  // Keep latest action functions in a ref so the trigger effect always has fresh closures
  actionFnsRef.current = {
    explain: explainResults,
    compare: compareRuns,
    refine: handleRefinePlan,
  };

  // Fire the requested action when triggerAction.seq changes.
  // Compare does NOT auto-fire — user must select a run then click the button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!triggerAction?.action || !results) return;
    setActiveMode(triggerAction.action);
    setRefineParsed(null);
    setRefineStatus("idle");
    setResponse("");
    setStatus("idle");
    setParsedSuggestion(null);
    if (triggerAction.action !== "compare") {
      actionFnsRef.current[triggerAction.action]?.();
    }
  }, [triggerAction?.seq]);

  // Auto-trigger refinement when the Refine Plan tab is selected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeMode !== "refine" || !isResultsContext || !hasSchedule || refineStatus === "loading") return;
    setResponse("");
    setStatus("idle");
    setParsedSuggestion(null);
    actionFnsRef.current.refine?.();
  }, [activeMode]);

  const panelButtonStyle = { width: "100%", justifyContent: "center" };

  const renderContent = () => {
    if (isStreaming && (activeKind === "suggestion" || activeKind === "explainResults")) {
      return (
        <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>
          Building suggestions…
        </div>
      );
    }
    if (parsedSuggestion) {
      const analysisText = parsedSuggestion.analysis
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "")
        .replace(/<json>[\s\S]*?<\/json>/gi, "")
        .trim();
      return (
        <div>
          {analysisText && (
            <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>
              {analysisText}
            </div>
          )}
          {parsedSuggestion.suggestions.length === 0 && (
            <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>No structured suggestions found.</div>
          )}
          {parsedSuggestion.suggestions.map(s => (
            <SuggestionCard
              key={s.rank}
              suggestion={s}
              model={model}
              aggregateStats={aggregateStats}
              onRunWithPatch={onRunWithPatch ? (sug) => handleApplyAndRerun(sug) : null}
              onApplyPatchedModel={onApplyPatchedModel}
              verifyStatus={verifyStatus[s.rank]}
              verifyResult={verifyResults[s.rank]}
              onSaved={() => setVerifyStatus(prev => ({ ...prev, [s.rank]: "saved" }))}
            />
          ))}
        </div>
      );
    }
    if (conversationHistory.length > 0) {
      return conversationHistory.map((entry, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{
            color: entry.role === "user" ? C.accent : C.text,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1,
            marginBottom: 4,
          }}>
            {entry.role === "user" ? "YOU" : "AI"}
          </div>
          <div style={{ color: C.text, fontFamily: FONT, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {entry.content}
          </div>
        </div>
      ));
    }
    if (isResultsContext && activeMode === "refine") {
      if (refineStatus === "loading") return "Building plan suggestions…";
      return "";
    }
    if (status === "loading") return "Waiting for analysis...";
    if (response) return response;
    if (activeKind === "comparison") return "Select a saved run above and click Compare.";
    return "";
  };

  const ACTION_TITLES = { explain: "Explain Results", compare: "Compare Runs", refine: "Refine Plan" };

  const overlayStyle = mobileFullscreen ? {
    position: "fixed",
    inset: 0,
    zIndex: 200,
    background: C.panel,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  } : overlay ? {
    position: "fixed",
    right: 16,
    top: 96,
    zIndex: 60,
    width: 380,
    minWidth: 320,
    maxWidth: 420,
    maxHeight: "calc(100vh - 120px)",
    overflow: "hidden",
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
  } : inline ? {
    width: "100%",
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } : sidebar ? {
    width: sidebarWidth,
    flex: `0 0 ${sidebarWidth}px`,
    borderLeft: `1px solid ${C.border}`,
    background: C.panel,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  } : {
    width: embedded ? "min(420px, 100%)" : 320,
    maxWidth: embedded ? 420 : 320,
    flex: embedded ? "0 0 auto" : "0 0 320px",
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 520,
    alignSelf: "stretch",
    marginLeft: embedded ? "auto" : 0,
    boxShadow: embedded ? "0 10px 28px rgba(0,0,0,0.24)" : "none",
  };

  const focusedAction = isResultsContext ? activeMode : null;
  const panelTitle = "Model Assistant";
  const panelSubtitle = isRunContext
    ? "Debug and diagnose simulation runs."
    : isResultsContext
    ? "Analyse and refine simulation results."
    : isOverviewContext
    ? "Review your model definition and set goals."
    : "Ask questions about your model design.";
  const innerStyle = sidebar
    ? { flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }
    : mobileFullscreen
    ? { flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }
    : overlay
    ? { flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }
    : { display: "contents" };

  return (
    <aside aria-label="Model Assistant" style={overlayStyle}>
      {sidebar && (
        <div
          onMouseDown={startDrag}
          title="Drag to resize"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{
            width: 2,
            height: 32,
            borderRadius: 2,
            background: C.border,
            opacity: 0.6,
            transition: "opacity 0.15s",
          }} />
        </div>
      )}
      <div style={innerStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 700 }}>{panelTitle}</div>
          {(sidebar || mobileFullscreen) && !focusedAction && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{panelSubtitle}</div>}
          {!embedded && !overlay && !sidebar && !mobileFullscreen && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{panelSubtitle}</div>}
        </div>
        {(overlay || sidebar || mobileFullscreen || (!embedded && onClose)) && onClose && (
          <button
            type="button"
            aria-label="Close Model Assistant"
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", padding: "0 4px" }}
          >✕</button>
        )}
      </div>

      {isRunContext ? (
        <DiagnosticsTab
          model={model}
          results={results}
          onGoToNode={onDiagnosticsNodeSelect || (() => {})}
        />
      ) : (
      <>
      {/* Mode tabs — shown when in results context */}
      {isResultsContext && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { id: "explain", label: "Analyse" },
            { id: "compare", label: "Compare" },
            ...(hasSchedule ? [{ id: "refine", label: "Refine Plan" }] : []),
          ].map(m => (
            <Btn key={m.id} small variant={activeMode === m.id ? "primary" : "ghost"} onClick={() => handleModeChange(m.id)}>{m.label}</Btn>
          ))}
        </div>
      )}

      {/* Starter prompt chips — context-aware, shown when not in run/results */}
      {sidebar && !isResultsContext && !isRunContext && conversationHistory.length === 0 && !isStreaming && (() => {
        const chips = isOverviewContext ? [
          { label: "Review name & description", prompt: "Please review my model's name and description — is it clear, specific, and complete? Suggest any improvements." },
          { label: "What can this model simulate?", prompt: "Based on the model structure, what simulation questions can this model answer? What are its key capabilities?" },
          { label: "Help me define KPI goals", prompt: "Help me set up meaningful KPI goals for this model. What performance measures should I track?" },
          { label: "Check model completeness", prompt: "Review this model's definition. What might be missing or incomplete — entities, queues, events, goals, or logic?" },
        ] : activeTab === "visual" ? [
          { label: "Explain the process flow", prompt: "Describe the process flow in this model — how do entities move through it?" },
          { label: "Are there structural gaps?", prompt: "Looking at this model's structure, are there any obvious gaps or missing connections?" },
        ] : activeTab === "entities" ? [
          { label: "Review my entity types", prompt: "Review the entity types defined in this model. Are they well-structured and complete?" },
          { label: "Explain entity roles", prompt: "Explain the different entity types and their roles in this simulation." },
        ] : activeTab === "queues" ? [
          { label: "Check my queuing setup", prompt: "Review the queues in this model. Are the configurations sensible for the process being modelled?" },
          { label: "Explain the queue structure", prompt: "Describe how the queues in this model relate to each other and to the entities." },
        ] : activeTab === "bevents" ? [
          { label: "Review arrival events", prompt: "Review the B-events (arrivals and completions) in this model. Are they correctly configured?" },
          { label: "Check arrival timing", prompt: "Are the scheduled times and distributions for my arrival events appropriate for this kind of system?" },
        ] : activeTab === "cevents" ? [
          { label: "Review conditional events", prompt: "Review the C-events in this model. Are the conditions and effects correctly specified?" },
          { label: "Explain the event logic", prompt: "Explain the conditional event logic in this model — what triggers each event and what happens?" },
        ] : activeTab === "schedules" ? [
          { label: "Explain the schedule structure", prompt: "Explain how the named schedules in this model are used and how they connect to arrival events." },
        ] : activeTab === "state" ? [
          { label: "Review state variables", prompt: "Review the state variables in this model. Are they used appropriately?" },
        ] : activeTab === "sections" ? [
          { label: "Explain the sections", prompt: "Explain the sections defined in this model and how they structure the workflow." },
        ] : [
          { label: "Explain this model's structure", prompt: "Give me an overview of this model's structure — entities, queues, events, and flow." },
          { label: "Check for design issues", prompt: "Review this model for potential design issues or improvements I should consider." },
        ];
        if (!chips.length) return null;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>QUICK START</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {chips.map(chip => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => { setModelQueryText(chip.prompt); runModelQuery(chip.prompt); }}
                  style={{
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4,
                    color: C.muted, fontFamily: FONT, fontSize: 11, padding: "4px 8px",
                    cursor: "pointer", textAlign: "left", transition: "border-color 0.1s",
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Model Q&A — shown in sidebar when not on results/execute tab */}
      {sidebar && !isResultsContext && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
            ASK ABOUT THIS MODEL
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              rows={2}
              value={modelQueryText}
              onChange={e => setModelQueryText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runModelQuery(modelQueryText); } }}
              disabled={isStreaming}
              placeholder="e.g. How many queues does this model have?"
              style={{
                flex: 1, background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12,
                padding: "7px 8px", resize: "none", outline: "none",
                opacity: isStreaming ? 0.6 : 1,
              }}
            />
            <button
              type="button"
              aria-label={listening && micTarget === "model" ? "Stop voice input" : "Start voice input"}
              onClick={() => toggleListening("model")}
              disabled={isStreaming}
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: (listening && micTarget === "model") ? C.red + "22" : "transparent",
                border: `1px solid ${(listening && micTarget === "model") ? C.red : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: isStreaming ? "not-allowed" : "pointer",
                opacity: isStreaming ? 0.45 : 1, transition: "all .15s",
              }}
            >
              <MicIcon size={15} color={(listening && micTarget === "model") ? C.red : C.muted} />
            </button>
            <button
              type="button"
              aria-label="Send"
              onClick={() => runModelQuery(modelQueryText)}
              disabled={!modelQueryText.trim() || isStreaming}
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: !modelQueryText.trim() || isStreaming ? C.muted : C.accent,
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: !modelQueryText.trim() || isStreaming ? "not-allowed" : "pointer",
                opacity: !modelQueryText.trim() || isStreaming ? 0.35 : 1,
                transition: "opacity .12s, background .12s",
              }}
            >
              <ArrowUpIcon size={16} color={C.bg} />
            </button>
          </div>
        </div>
      )}

      {/* Explain — shown when in results context with analyse mode, or in non-sidebar non-results context */}
      {(isResultsContext ? activeMode === "explain" : !sidebar) && (
        <Btn variant="primary" onClick={explainResults} disabled={!results || isStreaming} style={panelButtonStyle}>
          {isResultsContext ? 'Analyse results' : 'Explain results'}
        </Btn>
      )}

      {/* Compare — shown when in results context with compare mode */}
      {(isResultsContext ? activeMode === "compare" : !sidebar) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="compare-run" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>COMPARE WITH</label>
          <select
            id="compare-run"
            value={selectedRunId}
            onChange={event => setSelectedRunId(event.target.value)}
            disabled={!comparisonRuns.length || isStreaming}
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px" }}
          >
            {!comparisonRuns.length && <option value="">{comparisonLoading ? "Loading saved runs..." : "No comparison runs"}</option>}
            {comparisonRuns.map(run => <option key={run.id} value={run.id}>{run.label}</option>)}
          </select>
          {comparisonError && (
            <div role="status" style={{ color: C.amber, fontFamily: FONT, fontSize: 10 }}>
              Saved runs unavailable: {comparisonError}
            </div>
          )}
          <Btn variant="ghost" onClick={compareRuns} disabled={!results || !selectedRun || isStreaming} style={panelButtonStyle}>
            Compare
          </Btn>
        </div>
      )}

      {status === "error" && (
        <div role="alert" style={{ background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10, color: C.amber, fontFamily: FONT, fontSize: 11 }}>
          Analysis unavailable - try again. {error}
        </div>
      )}

      {!(isResultsContext && activeMode === "refine" && refineStatus !== "loading") && <div ref={responseAreaRef} aria-live="polite" aria-label="AI analysis response" style={{
        flex: 1,
        minHeight: 0,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 12,
        overflowY: "auto",
        color: (response || parsedSuggestion) ? C.text : C.muted,
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.7,
        whiteSpace: parsedSuggestion ? "normal" : "pre-wrap",
      }}>
        {renderContent()}
      </div>}

      {!isResultsContext && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <label htmlFor="query-input" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 6 }}>
          ASK A QUESTION
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            id="query-input"
            rows={2}
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            onKeyDown={handleQueryKeyDown}
            disabled={!results || isStreaming}
            placeholder={results ? "e.g. Which queue had the longest wait?" : "Run the model first…"}
            style={{
              flex: 1, background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12,
              padding: "7px 8px", resize: "none", outline: "none",
              opacity: (!results || isStreaming) ? 0.6 : 1,
            }}
          />
          <button
            type="button"
            aria-label={listening && micTarget === "query" ? "Stop voice input" : "Start voice input"}
            onClick={() => toggleListening("query")}
            disabled={!results || isStreaming}
            style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: (listening && micTarget === "query") ? C.red + "22" : "transparent",
              border: `1px solid ${(listening && micTarget === "query") ? C.red : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: (!results || isStreaming) ? "not-allowed" : "pointer",
              opacity: (!results || isStreaming) ? 0.45 : 1, transition: "all .15s",
            }}
          >
            <MicIcon size={15} color={(listening && micTarget === "query") ? C.red : C.muted} />
          </button>
          <button
            type="button"
            aria-label="Send"
            onClick={() => runQuery(queryText)}
            disabled={!results || !queryText.trim() || isStreaming}
            style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: (!results || !queryText.trim() || isStreaming) ? C.muted : C.accent,
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: (!results || !queryText.trim() || isStreaming) ? "not-allowed" : "pointer",
              opacity: (!results || !queryText.trim() || isStreaming) ? 0.35 : 1,
              transition: "opacity .12s, background .12s",
            }}
          >
            <ArrowUpIcon size={16} color={C.bg} />
          </button>
        </div>
      </div>}

      {(isResultsContext ? activeMode === "refine" : (!sidebar && hasSchedule)) && <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        {refineStatus === "loading" && (
          <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11, marginBottom: 8 }}>Analysing schedule constraints…</div>
        )}
        <div>
          {refineStatus === "error" && (
            <div role="alert" style={{ marginTop: 8, background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10, color: C.amber, fontFamily: FONT, fontSize: 11 }}>
              Plan refinement unavailable — {refineError}
            </div>
          )}
          {refineParsed && (
              <div style={{ marginTop: 10 }}>
                {refineParsed.analysis && (
                  <div style={{ color: C.text, fontFamily: FONT, fontSize: 11, lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>
                    {refineParsed.analysis}
                  </div>
                )}
                {refineParsed.recommendations.length === 0 && (
                  <div style={{ color: C.muted, fontFamily: FONT, fontSize: 11 }}>No schedule recommendations returned.</div>
                )}
                {refineParsed.recommendations.map(card => (
                  <RefinementCard
                    key={card.rank}
                    card={card}
                    model={model}
                    aggregateStats={aggregateStats}
                    onApplyAndRerun={onRunWithPatch ? handleRefineApplyAndRerun : null}
                    cardStatus={refineCardStatus[card.rank]}
                    cardResult={refineCardResults[card.rank]}
                  />
                ))}
                {refineParsed.infeasibleGoals.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ background: C.amber + "18", border: `1px solid ${C.amber}44`, borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT, fontWeight: 700, marginBottom: 6 }}>
                        The following goals cannot be met within current resource constraints:
                      </div>
                      {refineParsed.infeasibleGoals.map((g, i) => (
                        <div key={i} style={{ color: C.text, fontFamily: FONT, fontSize: 11, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700 }}>{g.goalLabel}</span>
                          {g.reason ? ` — ${g.reason}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
      </div>}

      </>
      )}
      </div>
      {!isRunContext && (isStreaming || status === "complete") && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 14px", borderTop: `1px solid ${C.border}` }}>
          {isStreaming && <Btn small variant="danger" onClick={stopStream}>Stop</Btn>}
          {status === "complete" && (response || conversationHistory.length > 0) && <Btn small variant="ghost" onClick={copyResponse}>Copy</Btn>}
          {status === "complete" && response && !savedSummary && onSaveInsights && (
            <Btn small variant="primary" onClick={() => {
              const insights = { summary: response.slice(0, 500), recommendation: "", savedAt: new Date().toISOString() };
              onSaveInsights(insights);
              setSavedSummary(insights);
            }}>Save to run</Btn>
          )}
          {savedSummary && <span style={{ fontSize: 10, color: C.green, fontFamily: FONT, fontWeight: 700, alignSelf: "center" }}>Saved</span>}
          {(conversationHistory.length > 0 || parsedSuggestion) && !isStreaming && <Btn small variant="ghost" onClick={clearConversation}>Clear</Btn>}
        </div>
      )}
      {isResultsContext && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px 14px" }}>
          <label htmlFor="results-followup-input" style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700, display: "block", marginBottom: 6 }}>
            FOLLOW-UP QUESTION
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              id="results-followup-input"
              rows={2}
              value={queryText}
              onChange={event => setQueryText(event.target.value)}
              onKeyDown={handleQueryKeyDown}
              disabled={!results || isStreaming}
              placeholder={results ? "Ask a follow-up question…" : "Run the model first…"}
              style={{
                flex: 1, background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12,
                padding: "7px 8px", resize: "none", outline: "none",
                opacity: (!results || isStreaming) ? 0.6 : 1,
              }}
            />
            <button
              type="button"
              aria-label={listening && micTarget === "query" ? "Stop voice input" : "Start voice input"}
              onClick={() => toggleListening("query")}
              disabled={!results || isStreaming}
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: (listening && micTarget === "query") ? C.red + "22" : "transparent",
                border: `1px solid ${(listening && micTarget === "query") ? C.red : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: (!results || isStreaming) ? "not-allowed" : "pointer",
                opacity: (!results || isStreaming) ? 0.45 : 1, transition: "all .15s",
              }}
            >
              <MicIcon size={15} color={(listening && micTarget === "query") ? C.red : C.muted} />
            </button>
            <button
              type="button"
              aria-label="Send follow-up"
              onClick={() => runQuery(queryText)}
              disabled={!results || !queryText.trim() || isStreaming}
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: (!results || !queryText.trim() || isStreaming) ? C.muted : C.accent,
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: (!results || !queryText.trim() || isStreaming) ? "not-allowed" : "pointer",
                opacity: (!results || !queryText.trim() || isStreaming) ? 0.35 : 1,
                transition: "opacity .12s, background .12s",
              }}
            >
              <ArrowUpIcon size={16} color={C.bg} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
