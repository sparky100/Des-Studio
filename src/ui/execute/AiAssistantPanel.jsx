// ui/execute/AiAssistantPanel.jsx — AiAssistantPanel

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { C, FONT } from "../shared/tokens.js";
import { Btn } from "../shared/components.jsx";
import { useToast } from "../shared/ToastContext.jsx";
import { streamNarrative, callLLMOnce } from "../../llm/apiClient.js";
import { buildCiResults, buildComparisonPrompt, buildExplainResultsPrompt, buildResultsQueryPrompt, buildSuggestionPrompt, parseSuggestionResponse, applySuggestionPatch, buildPlanRefinementPrompt, parsePlanRefinementResponse, applySchedulePatch, buildModelQueryPrompt } from "../../llm/prompts.js";
import { makeRunPromptPayload, makeRunLabel, makeSavedRunPromptPayload } from "./executeHelpers.js";

function ConfidenceBadge({ confidence }) {
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
  const fmt = v => v === null ? "—" : Number.isFinite(v) ? (Number.isInteger(v) ? v.toString() : v.toFixed(2)) : "—";
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
  const isManual = suggestion.change?.type === "manual";
  const canApply = !isManual && typeof onRunWithPatch === "function";
  const canSave = !isManual && typeof onApplyPatchedModel === "function" && verifyResult;
  const running = verifyStatus === "running";
  const [runName, setRunName] = useState("");

  const changeLabel = isManual
    ? "Manual change required"
    : `${suggestion.change?.target} count/capacity/value: ${suggestion.change?.from} -> ${suggestion.change?.to}`;

  const handleSave = () => {
    if (!canSave) return;
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
        {running ? "Running simulation…" : "Run with this change"}
      </Btn>
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
            baselineStats={verifyResult._baselineStats || aggregateStats}
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
  const color = feasible ? C.green : C.red;
  const label = feasible ? "Within capacity" : "Requires capacity increase";
  return (
    <span style={{ fontSize: 9, fontFamily: FONT, fontWeight: 700, color, border: `1px solid ${color}44`, borderRadius: 3, padding: "1px 5px", letterSpacing: 1 }}>
      {label.toUpperCase()}
    </span>
  );
}

function RefinementCard({ card, model, aggregateStats, onApplyAndRerun, cardStatus, cardResult }) {
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
            baselineStats={cardResult._baselineStats || aggregateStats}
            afterStats={cardResult.aggregateStats}
          />
        </div>
      )}
    </div>
  );
}

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
}) => {
  const isResultsContext = ['results', 'execute'].includes(activeTab);
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

  const runModelQuery = useCallback((question) => {
    if (!question.trim()) return;
    const messages = buildModelQueryPrompt(question, model, conversationHistory);
    setConversationHistory(prev => [...prev, { role: "user", content: question }]);
    setModelQueryText("");
    runPrompt(messages, "modelQuery");
  }, [model, conversationHistory, runPrompt]);

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

      // Snapshot the baseline at click-time so Before/After always compares
      // against the last run the user initiated, not whatever state arrives later.
      const capturedBaseline = aggregateStats;

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
    try {
      const prompt = buildPlanRefinementPrompt(model, exportConfig, { ...results, aggregateStats });
      const text = await callLLMOnce(prompt);
      const parsed = parsePlanRefinementResponse(text);
      setRefineParsed(parsed);
      setRefineStatus("complete");
    } catch (err) {
      setRefineError(err?.message || "Plan refinement unavailable");
      setRefineStatus("error");
    }
  }, [model, exportConfig, results, aggregateStats]);

  const handleRefineApplyAndRerun = useCallback(async (card) => {
    if (!onRunWithPatch) return;
    const rank = card.rank;
    setRefineCardStatus(prev => ({ ...prev, [rank]: "running" }));
    try {
      const patchedModel = applySchedulePatch(model, card);

      const capturedBaseline = aggregateStats;

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
    overflowY: "auto",
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
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
    width: 320,
    flex: "0 0 320px",
    borderLeft: `1px solid ${C.border}`,
    background: C.panel,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
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
  const panelTitle = (sidebar || mobileFullscreen)
    ? "Model Assistant"
    : (embedded || overlay ? "Analyse Results" : "Model Assistant");
  const innerStyle = sidebar
    ? { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }
    : mobileFullscreen
    ? { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }
    : { display: "contents" };

  return (
    <aside aria-label="AI assistant" style={overlayStyle}>
      <div style={innerStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: C.text, fontFamily: FONT, fontWeight: 700 }}>{panelTitle}</div>
          {(sidebar || mobileFullscreen) && !focusedAction && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{isResultsContext ? "Analyse and refine simulation results." : "Ask questions about this model."}</div>}
          {!embedded && !overlay && !sidebar && !mobileFullscreen && <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Ask questions about the latest run.</div>}
        </div>
        {(overlay || sidebar || mobileFullscreen || (!embedded && onClose)) && onClose && (
          <button
            type="button"
            aria-label="Close AI assistant"
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", padding: "0 4px" }}
          >✕</button>
        )}
      </div>

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

      {/* Model Q&A — shown in sidebar when not on results/execute tab */}
      {sidebar && !isResultsContext && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
            ASK ABOUT THIS MODEL
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              value={modelQueryText}
              onChange={e => setModelQueryText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runModelQuery(modelQueryText); } }}
              disabled={isStreaming}
              placeholder="e.g. How many queues does this model have?"
              style={{
                flex: 1, background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.text, fontFamily: FONT, fontSize: 12, padding: "7px 8px",
              }}
            />
            <Btn small variant="primary" onClick={() => runModelQuery(modelQueryText)}
              disabled={!modelQueryText.trim() || isStreaming} ariaLabel="Ask">Ask</Btn>
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
        <div style={{ display: "flex", gap: 6 }}>
          <input
            id="query-input"
            type="text"
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            onKeyDown={handleQueryKeyDown}
            disabled={!results || isStreaming}
            placeholder={results ? "e.g. Which queue had the longest wait?" : "Run the model first..."}
            style={{
              flex: 1,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              color: C.text,
              fontFamily: FONT,
              fontSize: 12,
              padding: "7px 8px",
            }}
          />
          <Btn
            small
            variant="primary"
            onClick={() => runQuery(queryText)}
            disabled={!results || !queryText.trim() || isStreaming}
            ariaLabel="Ask question"
          >
            Ask
          </Btn>
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

      </div>
      {(isStreaming || status === "complete") && (
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
          <div style={{ display: "flex", gap: 6 }}>
            <input
              id="results-followup-input"
              type="text"
              value={queryText}
              onChange={event => setQueryText(event.target.value)}
              onKeyDown={handleQueryKeyDown}
              disabled={!results || isStreaming}
              placeholder={results ? "Ask a follow-up question…" : "Run the model first…"}
              style={{
                flex: 1,
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                color: C.text,
                fontFamily: FONT,
                fontSize: 12,
                padding: "7px 8px",
              }}
            />
            <Btn
              small
              variant="primary"
              onClick={() => runQuery(queryText)}
              disabled={!results || !queryText.trim() || isStreaming}
              ariaLabel="Ask follow-up question"
            >
              Ask
            </Btn>
          </div>
        </div>
      )}
    </aside>
  );
};
